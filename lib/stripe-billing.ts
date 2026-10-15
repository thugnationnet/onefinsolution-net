import 'server-only';
import Stripe from 'stripe';
import { verifiedStripe } from './stripe';
import { creditPlans } from './credit-config';
import { currentUser } from './session';
import { assertCustomerMatchesScope, billingCustomerMetadata } from './billing-scope';
import { query, transaction } from './db';
import { approvedPrice, managedPlan } from './subscription-catalog';
import { findPlan, plans } from './plans';
import { fulfillStripeEvent } from './stripe-fulfillment';
import { siteUrl } from './site-url';
import { expectedStripeLivemode, stripeObjectMatchesMode } from './billing-environment';
import type { Price, Product, ProductWithPrices, Subscription } from '@/types/billing';

function priceView(price: Stripe.Price): Price {
  return { id: price.id, type: price.recurring ? 'recurring' : 'one-time', currency: price.currency,
    unit_amount: price.unit_amount!, interval: price.recurring?.interval || '', interval_count: price.recurring?.interval_count || 1 };
}
function productView(product: Stripe.Product): Product {
  return { id: product.id, name: product.name, description: product.description || '', status: product.active ? 'active' : 'inactive' };
}
export async function currentCustomer(create=false) {
  const user=await currentUser();
  if(!user) throw new Error('Please sign in.');
  const stripe=await verifiedStripe();
  const [mapping]=await query<{customer_id:string}>('select customer_id from billing_customers where user_id=$1',[user.id]);
  if(mapping) {
    const existing = await stripe.customers.retrieve(mapping.customer_id);
    assertCustomerMatchesScope(existing, 'subscription', user.id);
    return mapping.customer_id;
  }
  if(!create) return null;
  const customer=await stripe.customers.create({
    email:user.email,
    metadata: billingCustomerMetadata('subscription', user.id),
  });
  await query('insert into billing_customers(user_id,customer_id) values($1,$2) on conflict(user_id) do nothing',[user.id,customer.id]);
  const [saved]=await query('select customer_id from billing_customers where user_id=$1',[user.id]);
  if(saved?.customer_id!==customer.id) throw new Error('Billing account conflict.');
  return customer.id;
}

async function catalog() {
  const stripe = await verifiedStripe();
  const ids = Object.keys(creditPlans());
  if (ids.length === 0) throw new Error('No Workspace credit packs are configured.');
  const products = new Map<string, ProductWithPrices>();
  for (const id of ids) {
    const price = await stripe.prices.retrieve(id, { expand: ['product'] });
    const product = price.product as Stripe.Product;
    if (!stripeObjectMatchesMode(price.livemode) || !price.active || price.currency !== 'usd' || price.unit_amount === null || product.deleted || !product.active) throw new Error('Configured catalog contains an unavailable price.');
    const plan = creditPlans()[id];
    if (price.recurring || plan.kind !== 'pack') throw new Error('Workspace credit packs must use one-time Stripe prices.');
    const existing = products.get(product.id) || { ...productView(product), prices: [] };
    existing.prices.push(priceView(price));
    products.set(product.id, existing);
  }
  return Array.from(products.values());
}
async function subscriptions(): Promise<Subscription[]> {
  const customer = await currentCustomer();
  if (!customer) return [];
  const stripe = await verifiedStripe();
  const data = await stripe.subscriptions.list({ customer, status: 'all', limit: 100, expand: ['data.items.data.price.product'] });
  return data.data.map(sub => {
    const item = sub.items.data[0];
    return { id: sub.id, status: sub.status === 'active' ? 'active' : sub.status === 'trialing' ? 'trialing' : sub.status === 'past_due' || sub.status === 'unpaid' ? 'past_due' : 'inactive',
      price: priceView(item.price), product: productView(item.price.product as Stripe.Product),
      cancel_at_period_end: sub.cancel_at_period_end, canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      current_period_start: new Date(item.current_period_start * 1000).toISOString(), current_period_end: new Date(item.current_period_end * 1000).toISOString() };
  });
}
async function checkout(priceId: string) {
  const stripe=await verifiedStripe();
  const price=await stripe.prices.retrieve(priceId);
  const plan=managedPlan(price);
  if(!plan) throw new Error('This legacy price is no longer sold. Choose a current plan.');
  return `${siteUrl()}/subscribe?plan=${plan.key}&mode=paid`;
}

// The same response contract keeps existing pricing and subscription components intact.
export function createStripeBilling() {
  return {
    async getProducts() {
      try { return { data: { products: await catalog() }, error: null }; }
      catch { return { data: { products: null }, error: { message: 'Unable to load plans.' } }; }
    },
    async getSubscriptions() {
      try { return { data: { subscriptions: await subscriptions() }, error: null }; }
      catch { return { data: { subscriptions: null }, error: { message: 'Unable to load subscriptions.' } }; }
    },
    async createCheckoutSession(id: string) {
      try { return { data: { url: await checkout(id) }, error: null }; }
      catch (error) { return { data: { url: null }, error: { message: error instanceof Error ? error.message : 'Unable to create checkout.' } }; }
    },
    async updateSubscription(id: string, settings: { cancel_at_period_end: boolean }) {
      try {
        const customer = await currentCustomer();
        const stripe = await verifiedStripe();
        const sub = await stripe.subscriptions.retrieve(id);
        const subCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        if (!customer || !subCustomerId || subCustomerId !== customer || !stripeObjectMatchesMode(sub.livemode)) throw new Error('Subscription not found.');
        if (settings.cancel_at_period_end && sub.schedule) {
          const schedule = await stripe.subscriptionSchedules.retrieve(typeof sub.schedule === 'string' ? sub.schedule : sub.schedule.id);
          if (schedule.metadata?.app !== 'chatbot-template') throw new Error('Subscription schedule is managed outside this app.');
          await stripe.subscriptionSchedules.release(schedule.id);
        }
        await stripe.subscriptions.update(id, settings);
        if(settings.cancel_at_period_end) await query('update billing_subscriptions set next_plan_key=null,next_plan_at=null where id=$1',[id]);
        await fulfillStripeEvent(stripe,{type:'customer.subscription.updated',livemode:expectedStripeLivemode(),data:{object:{id}}} as Stripe.Event);
        return { data: { subscription: null }, error: null };
      } catch { return { data: { subscription: null }, error: { message: 'Unable to update subscription.' } }; }
    },
  };
}

export async function schedulePlanChange(planSelection: string) {
  const user=await currentUser();if(!user) throw new Error('Please sign in.');
  const stripe=await verifiedStripe();
  let planKey=plans.find(candidate=>candidate.key===planSelection)?.key;
  if(!planKey) {
    const selectedPrice=await stripe.prices.retrieve(planSelection);
    const selectedPlan=managedPlan(selectedPrice);
    if(!selectedPlan) throw new Error('Choose an available subscription plan.');
    const approved=await approvedPrice(stripe,selectedPlan.key);
    if(approved.id!==selectedPrice.id) throw new Error('This subscription price is no longer available.');
    planKey=selectedPlan.key;
  }
  const plan=findPlan(planKey),customer=await currentCustomer();
  if(!customer) throw new Error('No subscription found.');
  const price=await approvedPrice(stripe,planKey);
  return transaction(async client=>{
    await client.query('select id from app_users where id=$1 for update',[user.id]);
    const list=await stripe.subscriptions.list({customer,status:'all',limit:100});
    const active=list.data.filter(sub=>!['canceled','incomplete_expired'].includes(sub.status));
    if(list.has_more||active.length!==1||!['active','trialing'].includes(active[0].status)) throw new Error('Resolve your existing subscription before changing plans.');
    const sub=active[0],item=sub.items.data[0];
    if(!stripeObjectMatchesMode(sub.livemode)||sub.metadata.app!=='chatbot-template'||sub.cancel_at_period_end||sub.items.data.length!==1||item.quantity!==1) throw new Error('Reactivate renewal or contact support before switching plans.');
    const schedule=sub.schedule?await stripe.subscriptionSchedules.retrieve(typeof sub.schedule==='string'?sub.schedule:sub.schedule.id):null;
    if(schedule&&schedule.metadata?.app!=='chatbot-template') throw new Error('This schedule is managed outside One Fin.');
    if(item.price.id===price.id) {
      if(schedule) await stripe.subscriptionSchedules.release(schedule.id);
      await client.query('update billing_subscriptions set next_plan_key=null,next_plan_at=null where id=$1',[sub.id]);
      return new Date(item.current_period_end*1000).toISOString();
    }
    const target=schedule||await stripe.subscriptionSchedules.create({from_subscription:sub.id});
    await stripe.subscriptionSchedules.update(target.id,{metadata:{app:'chatbot-template'},end_behavior:'release',proration_behavior:'none',phases:[
      {start_date:target.current_phase?.start_date||item.current_period_start,end_date:item.current_period_end,items:[{price:item.price.id,quantity:1}],proration_behavior:'none',...(sub.status==='trialing'?{trial_end:sub.trial_end!}:{})},
      {items:[{price:price.id,quantity:1}],duration:{interval:plan.interval,interval_count:1},proration_behavior:'none',metadata:{app:'chatbot-template',plan_key:plan.key}},
    ]});
    const date=new Date(item.current_period_end*1000).toISOString();
    await client.query('update billing_subscriptions set next_plan_key=$2,next_plan_at=$3 where id=$1',[sub.id,plan.key,date]);
    return date;
  });
}
