import 'server-only';
import type Stripe from 'stripe';
import { query, transaction } from './db';
import { verifiedStripe } from './stripe';
import { currentCustomer } from './stripe-billing';
import { approvedPrice } from './subscription-catalog';
import { findPlan } from './plans';
import { privateHash } from './abuse-identity';
import { fulfillStripeEvent } from './stripe-fulfillment';
import { expectedStripeLivemode, stripeObjectMatchesMode } from './billing-environment';
import {
  assertSetupIntentOwnedByCustomer,
  requireOwnedPaymentMethod,
  stripePaymentMethodId,
} from './billing-scope';

type Enrollment = { user_id:string; request_id:string; plan_key:string; mode:'trial'|'paid'; setup_id:string|null; subscription_id:string|null; price_id:string|null; trial_end:string|null; consent_at:Date|null; created_at:Date };
const objectId = (object: string | { id?:string } | null) => typeof object === 'string' ? object : object?.id;
export async function prepareEnrollment(userId:string, key:string, mode:'trial'|'paid') {
  if(key==='custom') throw new Error('Custom plans are arranged with our team. Choose a standard plan or contact support.');
  findPlan(key);
  const stripe=await verifiedStripe(),customer=await currentCustomer(true);
  const price=await approvedPrice(stripe,key);
  const [resume]=await query<Enrollment>('select * from billing_enrollments where user_id=$1 and plan_key=$2 and mode=$3',[userId,key,mode]);
  if(resume?.consent_at && resume.setup_id && !resume.subscription_id) {
    const setup=await stripe.setupIntents.retrieve(resume.setup_id);
    if(!stripeObjectMatchesMode(setup.livemode)||objectId(setup.customer)!==customer||!setup.client_secret)throw new Error('Unable to resume this request.');
    return {clientSecret:setup.client_secret,setupId:setup.id};
  }
  const subscriptions=await stripe.subscriptions.list({customer:customer!,status:'all',limit:100});
  if(subscriptions.data.some(sub=>!['canceled','incomplete_expired'].includes(sub.status))) throw new Error('You already have a subscription. Manage it from Plans & billing.');
  if(mode==='trial' && (await query('select 1 from billing_trial_claims where user_id=$1',[userId])).length) throw new Error('Your free trial has already been used. Choose Subscribe without trial.');
  const enrollment=await transaction(async client=>{
    await client.query('select id from app_users where id=$1 for update',[userId]);
    const {rows}=await client.query<Enrollment>('select * from billing_enrollments where user_id=$1',[userId]);
    const previous=rows[0];
    if(previous?.consent_at && !previous.subscription_id) throw new Error('A subscription request is awaiting confirmation. Return to the same plan to finish it.');
    if(previous && !previous.subscription_id && previous.plan_key===key && previous.mode===mode) return previous;
    const result=await client.query<Enrollment>(`insert into billing_enrollments(user_id,plan_key,mode,price_id) values($1,$2,$3,$4)
      on conflict(user_id) do update set request_id=gen_random_uuid(),plan_key=$2,mode=$3,price_id=$4,setup_id=null,subscription_id=null,trial_end=null,consent_at=null,created_at=now() returning *`,[userId,key,mode,price.id]);
    return result.rows[0];
  });
  const setup=enrollment.setup_id?await stripe.setupIntents.retrieve(enrollment.setup_id):await stripe.setupIntents.create({customer:customer!,usage:'off_session',allowed_payment_method_types:['card'],metadata:{app:'chatbot-template',user_id:userId,request_id:enrollment.request_id}},{idempotencyKey:`onefin-setup:${enrollment.request_id}`});
  if(!stripeObjectMatchesMode(setup.livemode) || objectId(setup.customer)!==customer || !setup.client_secret) throw new Error('Card setup unavailable.');
  await query('update billing_enrollments set setup_id=$1 where user_id=$2 and request_id=$3',[setup.id,userId,enrollment.request_id]);
  return {clientSecret:setup.client_secret,setupId:setup.id};
}

export async function completeEnrollment(userId: string, setupId: string, consent: boolean) {
  if (!consent) throw new Error('Confirm the recurring payment terms before continuing.');

  const stripe = await verifiedStripe(), customer = await currentCustomer();
  const [initial] = await query<Enrollment>('select * from billing_enrollments where user_id=$1 and setup_id=$2', [userId, setupId]);
  if (!initial || !customer) throw new Error('Card setup does not belong to this account.');

  const setup = await stripe.setupIntents.retrieve(setupId);
  if (!stripeObjectMatchesMode(setup.livemode) || setup.status !== 'succeeded' || objectId(setup.customer) !== customer || setup.metadata?.request_id !== initial.request_id) {
    throw new Error('Finish card verification before starting your subscription.');
  }

  assertSetupIntentOwnedByCustomer(setup, customer!);
  const paymentMethodId = stripePaymentMethodId(setup.payment_method);
  if (!paymentMethodId) throw new Error('Unable to verify the card for this subscription.');
  const paymentMethod = await requireOwnedPaymentMethod(stripe, customer!, paymentMethodId);
  if (paymentMethod.type !== 'card' || !paymentMethod.card?.fingerprint) {
    throw new Error('Unable to verify the card for this subscription.');
  }

  const price = await approvedPrice(stripe, initial.plan_key), plan = findPlan(initial.plan_key);

  // Existing trial fingerprint logic and enrollment commit (preserved exactly)
  const enrollment = await transaction(async client => {
    await client.query('select id from app_users where id=$1 for update', [userId]);
    const { rows } = await client.query<Enrollment>('select * from billing_enrollments where user_id=$1', [userId]);
    const current = rows[0];
    if (current.request_id !== initial.request_id) throw new Error('This selection changed in another tab. Reload the page.');
    if (current.consent_at) return current;

    if (current.mode === 'trial') {
      const hash = privateHash(`trial-card:${paymentMethod.card!.fingerprint}`);
      const claims = await client.query('select request_id from billing_trial_claims where user_id=$1 or card_hash=$2', [userId, hash]);
      if (claims.rows.some(row => row.request_id !== current.request_id)) throw new Error('A free trial has already been used with this account or card. Choose Subscribe without trial.');
      await client.query('insert into billing_trial_claims(user_id,card_hash,request_id) values($1,$2,$3) on conflict do nothing', [userId, hash, current.request_id]);
      const verified = await client.query('select request_id from billing_trial_claims where user_id=$1 and card_hash=$2', [userId, hash]);
      if (verified.rows[0]?.request_id !== current.request_id) throw new Error('This card is not eligible for another trial.');
    }
    return (await client.query<Enrollment>('update billing_enrollments set consent_at=now(),trial_end=$2 where user_id=$1 returning *', [userId, current.mode === 'trial' ? Math.floor(Date.now() / 1000) + plan.trialDays * 86400 : null])).rows[0];
  });

  const existing = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
  let subscription = existing.data.find(sub => sub.metadata.enrollment_id === enrollment.request_id);
  if (!subscription) {
    if (existing.has_more || existing.data.some(sub => !['canceled', 'incomplete_expired'].includes(sub.status))) throw new Error('An existing subscription needs attention in Plans & billing.');
    if (Date.now() - new Date(enrollment.consent_at!).getTime() > 23 * 3600000) throw new Error('This unfinished request needs support review before it can be retried.');

    subscription = await stripe.subscriptions.create({
      customer,
      items: [{ price: price.id, quantity: 1 }],
      default_payment_method: paymentMethod.id,
      collection_method: 'charge_automatically',
      payment_behavior: 'default_incomplete',
      billing_mode: { type: 'flexible' },
      payment_settings: { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
      ...(enrollment.mode === 'trial' ? {
        trial_end: Number(enrollment.trial_end),
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } }
      } : {}),
      metadata: { app: 'chatbot-template', plan_key: plan.key, enrollment_id: enrollment.request_id },
      expand: ['latest_invoice.confirmation_secret']
    }, { idempotencyKey: `onefin-subscription:${enrollment.request_id}` });
  }

  if (!stripeObjectMatchesMode(subscription.livemode) || objectId(subscription.customer) !== customer) throw new Error('Unexpected billing account.');

  await query('update billing_enrollments set subscription_id=$1 where user_id=$2 and request_id=$3', [subscription.id, userId, enrollment.request_id]);
  await fulfillStripeEvent(stripe, { type: 'customer.subscription.updated', livemode: expectedStripeLivemode(), data: { object: { id: subscription.id } } } as Stripe.Event);

  const invoiceId = objectId(subscription.latest_invoice);
  const invoice = invoiceId ? await stripe.invoices.retrieve(invoiceId, { expand: ['confirmation_secret'] }) : null;
  if (invoice?.status === 'paid') await fulfillStripeEvent(stripe, { type: 'invoice.paid', livemode: expectedStripeLivemode(), data: { object: { id: invoice.id } } } as Stripe.Event);

  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    paymentSecret: invoice?.status === 'open' ? invoice.confirmation_secret?.client_secret : null,
  };
}
