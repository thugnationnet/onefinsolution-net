import 'server-only';
import Stripe from 'stripe';
import { query, transaction } from './db';
import { creditPlans } from './credit-config';
import { managedPlan } from './subscription-catalog';
import { applySoftwareStorefrontRefund } from './software-refund';
import { fulfillSoftwareStorefrontPayment } from './software-storefront-fulfillment';
import { queueBillingNotice } from './billing-notices';
import { priceLabel } from './plans';
import { normalizeBillingCurrency } from './billing-currency';
import { stripeObjectMatchesMode } from './billing-environment';
import { sitePath } from './site-url';
import { assertWorkspaceCreditAmountCents, creditsFromAmountCents } from './workspace-credit-pack';

async function owner(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  scope: 'subscription' | 'workspace' = 'subscription',
) {
  const id = typeof customer === 'string' ? customer : customer?.id;
  if (!id) throw new Error('Missing customer.');
  const table = scope === 'workspace' ? 'workspace_billing_customers' : 'billing_customers';
  const [data]=await query(`select user_id from ${table} where customer_id=$1`,[id]);
  if (data) return data.user_id as string;
  if (scope === 'workspace') {
    const [legacy]=await query('select user_id from workspace_legacy_billing_customers where customer_id=$1',[id]);
    if (legacy) return legacy.user_id as string;
  }
  throw new Error('Customer mapping unavailable.');
}
async function grant(user: string, reference: string, price: string, quantity: number) {
  const plan = creditPlans()[price];
  if (!plan || plan.kind !== 'pack' || quantity !== 1) throw new Error('Unexpected paid price or quantity.');
  await query('select grant_credits($1,$2,$3)',[user,reference,plan.credits]);
}
async function recordSubscription(user: string, sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  if (!item || !stripeObjectMatchesMode(sub.livemode)) throw new Error('Invalid subscription snapshot.');
  await query(`insert into billing_subscriptions(id,user_id,price_id,status,period_start,period_end,cancel_at_period_end,observed_at)
    values($1,$2,$3,$4,$5,$6,$7,now()) on conflict(id) do update set price_id=excluded.price_id,status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,cancel_at_period_end=excluded.cancel_at_period_end,observed_at=excluded.observed_at`,
    [sub.id,user,item.price.id,sub.status,new Date(item.current_period_start*1000).toISOString(),new Date(item.current_period_end*1000).toISOString(),sub.cancel_at_period_end]);
  await query('update billing_subscriptions set trial_end=$2 where id=$1',[sub.id,sub.trial_end?new Date(sub.trial_end*1000).toISOString():null]);
  await query('update billing_subscriptions set next_plan_key=null,next_plan_at=null where id=$1 and next_plan_at<=$2',[sub.id,new Date(item.current_period_start*1000).toISOString()]);
  const plan=managedPlan(item.price);
  if(plan && sub.status==='trialing' && sub.trial_end && sub.default_payment_method) {
    const [claim]=await query('select 1 from billing_trial_claims where user_id=$1 and request_id=$2',[user,sub.metadata.enrollment_id]);
    if(claim) {
      await query(`insert into membership_access(subscription_id,user_id,plan_key,expires_at) values($1,$2,$3,$4)
        on conflict(subscription_id) do update set expires_at=excluded.expires_at,plan_key=excluded.plan_key,updated_at=now()`,[sub.id,user,plan.key,new Date(sub.trial_end*1000).toISOString()]);
      await queueBillingNotice(`trial:${sub.id}`,user,'Your trial has started',`Your ${plan.trialDays}-day ${plan.name} trial ends ${new Date(sub.trial_end*1000).toISOString()}. Your saved card will then be charged ${priceLabel(plan)} automatically unless you cancel before that time. Manage or cancel at ${sitePath('/dashboard/billing')}.`);
    }
  }
  if(['canceled','unpaid','paused','incomplete_expired'].includes(sub.status)) await query('update membership_access set expires_at=least(expires_at,now()),updated_at=now() where subscription_id=$1',[sub.id]);
}
export async function applyWorkspaceCreditsFromPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<void> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['payment_method'] });
  if (intent.metadata?.app !== 'chatbot-template' || intent.metadata.flow !== 'workspace-credit-purchase') {
    return;
  }
  if (intent.status !== 'succeeded') {
    throw new Error(`Workspace credit PaymentIntent is not succeeded (${intent.status}).`);
  }
  if (!stripeObjectMatchesMode(intent.livemode) || !normalizeBillingCurrency(intent.currency)) {
    throw new Error('Unexpected Workspace credit payment.');
  }

  const purchaseId = intent.metadata.purchase_id;
  const userId = intent.metadata.user_id;
  if (!purchaseId || !userId || !/^[0-9a-f-]{36}$/i.test(purchaseId) || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error('Invalid Workspace credit purchase metadata.');
  }

  let purchaseRows = await query<{ amount: number; credits: number; status: string }>(
    `select amount, credits, status from workspace_credit_purchases
     where id=$1 and user_id=$2 and (stripe_payment_intent is null or stripe_payment_intent=$3)`,
    [purchaseId, userId, intent.id],
  );
  let purchase = purchaseRows[0];

  // Self-heal for hosted Checkout races: create ledger row from trusted PI metadata.
  if (!purchase) {
    const metaAmount = Number(intent.metadata.amount_cents || 0);
    const metaCredits = Number(intent.metadata.credits || 0);
    if (!metaAmount || !metaCredits) {
      throw new Error('Workspace credit purchase record unavailable.');
    }
    assertWorkspaceCreditAmountCents(metaAmount);
    if (metaCredits !== creditsFromAmountCents(metaAmount)) {
      throw new Error('Workspace credit purchase amount/credits mismatch.');
    }
    await query(
      `insert into workspace_credit_purchases(id, user_id, amount, credits, status, stripe_payment_intent)
       values ($1,$2,$3,$4,'pending',$5)
       on conflict (id) do nothing`,
      [purchaseId, userId, metaAmount, metaCredits, intent.id],
    );
    purchaseRows = await query<{ amount: number; credits: number; status: string }>(
      `select amount, credits, status from workspace_credit_purchases where id=$1 and user_id=$2`,
      [purchaseId, userId],
    );
    purchase = purchaseRows[0];
  }
  if (!purchase) throw new Error('Workspace credit purchase record unavailable.');
  if (purchase.status === 'succeeded') return;

  const amountCents = Number(purchase.amount);
  const credits = Number(purchase.credits);
  assertWorkspaceCreditAmountCents(amountCents);
  if (credits !== creditsFromAmountCents(amountCents)) {
    throw new Error('Workspace credit purchase amount/credits mismatch.');
  }
  const presentmentMeta = Number(intent.metadata?.presentment_amount_cents || 0);
  const expectedPresentment =
    presentmentMeta > 0 ? presentmentMeta : intent.currency === 'usd' ? amountCents : null;
  if (expectedPresentment != null) {
    if (intent.amount !== expectedPresentment || intent.amount_received !== expectedPresentment) {
      throw new Error('Workspace credit payment amount mismatch.');
    }
  } else if (!intent.amount_received || intent.amount_received <= 0) {
    throw new Error('Workspace credit payment amount mismatch.');
  }
  if (intent.metadata.credits && Number(intent.metadata.credits) !== credits) {
    throw new Error('Workspace credit metadata mismatch.');
  }

  const customerId = typeof intent.customer === 'string' ? intent.customer : intent.customer?.id;
  const paymentOwner = await owner(customerId || null, 'workspace');
  if (paymentOwner !== userId) throw new Error('Workspace credit payment owner mismatch.');

  const method = intent.payment_method;
  const saveForOffSession = intent.setup_future_usage === 'off_session';

  await transaction(async client => {
    const { rows } = await client.query(
      `select id from workspace_credit_purchases
       where id=$1 and user_id=$2 and amount=$3 and credits=$4
         and (stripe_payment_intent is null or stripe_payment_intent=$5)
       for update`,
      [purchaseId, userId, amountCents, credits, intent.id],
    );
    if (!rows.length) throw new Error('Workspace credit purchase record unavailable.');
    await client.query('select grant_credits($1,$2,$3)', [userId, `workspace:payment-intent:${intent.id}`, credits]);
    let receiptUrl: string | null = null;
    try {
      const charges = await stripe.charges.list({ payment_intent: intent.id, limit: 1 });
      receiptUrl = charges.data[0]?.receipt_url || null;
    } catch {
      /* receipt is optional */
    }
    await client.query(
      `insert into workspace_credit_transactions(user_id,purchase_id,stripe_payment_intent,amount,currency,credits,receipt_url)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (purchase_id) do nothing`,
      [
        userId,
        purchaseId,
        intent.id,
        amountCents,
        normalizeBillingCurrency(intent.currency) || intent.currency,
        credits,
        receiptUrl,
      ],
    );
    if (receiptUrl) {
      await client.query(
        `update workspace_credit_purchases set receipt_url = coalesce(receipt_url, $2) where id=$1`,
        [purchaseId, receiptUrl],
      );
    }
    await client.query(
      `update workspace_credit_purchases
       set status='succeeded',
           stripe_payment_intent=$3,
           completed_at=coalesce(completed_at,now())
       where id=$1 and user_id=$2`,
      [purchaseId, userId, intent.id],
    );
    if (
      saveForOffSession &&
      method &&
      typeof method !== 'string' &&
      method.type === 'card' &&
      method.card
    ) {
      await client.query(
        `insert into workspace_credit_settings(user_id,payment_method_id,card_brand,card_last4,card_exp_month,card_exp_year,updated_at)
         values($1,$2,$3,$4,$5,$6,now())
         on conflict(user_id) do update set payment_method_id=excluded.payment_method_id,card_brand=excluded.card_brand,
           card_last4=excluded.card_last4,card_exp_month=excluded.card_exp_month,card_exp_year=excluded.card_exp_year,updated_at=now()`,
        [userId, method.id, method.card.brand, method.card.last4, method.card.exp_month, method.card.exp_year],
      );
    }
  });

  try {
    const amount =
      typeof intent.amount_received === 'number'
        ? `$${(intent.amount_received / 100).toFixed(2)} USD`
        : typeof intent.amount === 'number'
          ? `$${(intent.amount / 100).toFixed(2)} USD`
          : null;
    await queueBillingNotice(
      `workspace-credits-pi:${intent.id}`,
      userId,
      amount ? `Credits purchased - ${amount}` : 'Workspace credits added',
      `Your workspace credit purchase completed successfully${amount ? ` (${amount})` : ''}. Credits are available immediately in ${sitePath('/workspace')}.`,
    );
  } catch {
    /* credit receipt is best-effort */
  }
}


export async function fulfillStripeEvent(stripe: Stripe, event: Stripe.Event) {
  if (!stripeObjectMatchesMode(event.livemode)) throw new Error('Stripe event mode does not match the application.');
  if (['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled'].includes(event.type)) {
    const intentId = (event.data.object as Stripe.PaymentIntent).id;
    const intent = await stripe.paymentIntents.retrieve(intentId);
    if (intent.metadata?.app !== 'chatbot-template' || intent.metadata.flow !== 'workspace-credit-purchase') return;
    const purchaseId = intent.metadata.purchase_id;
    const userId = intent.metadata.user_id;
    if (!purchaseId || !userId || !/^[0-9a-f-]{36}$/i.test(purchaseId) || !/^[0-9a-f-]{36}$/i.test(userId)) {
      throw new Error('Invalid Workspace credit purchase metadata.');
    }
    if (event.type !== 'payment_intent.succeeded') {
      await query(
        `update workspace_credit_purchases set status='failed'
         where id=$1 and user_id=$2 and (stripe_payment_intent is null or stripe_payment_intent=$3) and status='pending'`,
        [purchaseId, userId, intent.id],
      );
      return;
    }
    await applyWorkspaceCreditsFromPaymentIntent(stripe, intentId);
  } else if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id, {
      expand: ['payment_intent'],
    });
    if (session.mode !== 'payment') return;
    if (session.payment_status !== 'paid' && event.type === 'checkout.session.completed') {
      // async_payment_succeeded handles delayed methods; ignore unpaid completed shells
      if (session.payment_status !== 'paid') return;
    }
    if (!stripeObjectMatchesMode(session.livemode)) return;

    // Software storefront is fulfilled via payment_intent.* webhooks (isolated module).
    if (session.metadata?.flow === 'software-storefront') {
      return;
    }

    // Hosted Workspace credit Checkout (primary low-friction path).
    // Credits are applied from the PaymentIntent metadata (same as Elements flow).
    if (
      session.metadata?.app === 'chatbot-template' &&
      (session.metadata?.flow === 'workspace-credit-purchase' ||
        session.metadata?.billing_scope === 'workspace')
    ) {
      const piId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || null;
      if (!piId) throw new Error('Workspace Checkout session is missing payment_intent.');
      await applyWorkspaceCreditsFromPaymentIntent(stripe, piId);
      return;
    }

    // Legacy catalog price Checkout (creditPlans / managed prices).
    if (session.metadata?.app !== 'chatbot-template' || session.payment_status !== 'paid') return;
    if (!normalizeBillingCurrency(session.currency)) throw new Error('Unexpected checkout currency or mode.');
    const user = await owner(session.customer, 'workspace');
    for await (const item of stripe.checkout.sessions.listLineItems(session.id, { limit: 100 })) {
      if (!item.price) throw new Error('Missing price.');
      await grant(user, `checkout:${session.id}:${item.id}`, item.price.id, item.quantity || 0);
    }
    const paid =
      typeof session.amount_total === 'number'
        ? `$${(session.amount_total / 100).toFixed(2)} ${String(session.currency || 'usd').toUpperCase()}`
        : null;
    await queueBillingNotice(
      `workspace-credits-checkout:${session.id}`,
      user,
      paid ? `Credits purchased - ${paid}` : 'Workspace credits added',
      `Your workspace credit purchase completed successfully${paid ? ` (${paid})` : ''}. Open ${sitePath('/workspace')} to use your balance.`,
    );
  } else if (event.type === 'invoice.paid') {
    const invoiceId = (event.data.object as Stripe.Invoice).id;
    if (!invoiceId) throw new Error('Missing invoice ID.');
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (invoice.parent?.subscription_details?.metadata?.app !== 'chatbot-template') return;
    if (!stripeObjectMatchesMode(invoice.livemode) || invoice.status !== 'paid' || !normalizeBillingCurrency(invoice.currency)) throw new Error('Unexpected invoice.');
    const user = await owner(invoice.customer);
    const source = invoice.parent.subscription_details.subscription;
    const subscriptionId = typeof source === 'string' ? source : source?.id;
    if (!subscriptionId) throw new Error('Missing invoice subscription.');
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    await recordSubscription(user, sub);
    const managed=managedPlan(sub.items.data[0].price);
    if(managed) {
      // The zero-dollar trial invoice is not a paid membership. Read invoice
      // lines, not the latest subscription period, when handling delayed events.
      if(invoice.amount_paid<=0 || invoice.amount_remaining!==0 || sub.status==='canceled') return;
      for await(const line of stripe.invoices.listLineItems(invoiceId,{limit:100})) {
        if(line.parent?.subscription_item_details?.proration || line.amount<=0 || line.quantity!==1) continue;
        const source=line.pricing?.price_details?.price;
        const price=typeof source==='string'?await stripe.prices.retrieve(source):source;
        const paidPlan=price?managedPlan(price):undefined;
        if(!paidPlan) throw new Error('Unknown membership price.');
        await query(`insert into membership_access(subscription_id,user_id,plan_key,expires_at) values($1,$2,$3,$4)
          on conflict(subscription_id) do update set plan_key=case when excluded.expires_at>=membership_access.expires_at then excluded.plan_key else membership_access.plan_key end,expires_at=greatest(membership_access.expires_at,excluded.expires_at),updated_at=now()`,[sub.id,user,paidPlan.key,new Date(line.period.end*1000).toISOString()]);
      }
      await queueBillingNotice(`paid:${invoiceId}`,user,'Payment received',`Payment of ${(invoice.amount_paid/100).toFixed(2)} ${invoice.currency.toUpperCase()} received. Review your plan and renewal at ${sitePath('/dashboard/billing')}.`);
      return;
    }
    return;
  } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.trial_will_end'].includes(event.type)) {
    // Retrieve current state so delayed events cannot restore an old subscription status.
    const sub = await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
    if (sub.metadata.app !== 'chatbot-template') return;
    const user = await owner(sub.customer);
    await recordSubscription(user, sub);
    const planName =
      (typeof sub.items.data[0]?.price?.nickname === 'string' && sub.items.data[0].price.nickname) ||
      sub.items.data[0]?.price?.id ||
      'Subscription';
    const periodEnd = sub.items.data[0]?.current_period_end
      ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
      : null;
    if (event.type === 'customer.subscription.created' && ['active', 'trialing'].includes(sub.status)) {
      await queueBillingNotice(
        `subscription-activated:${sub.id}:${sub.status}`,
        user,
        'Subscription activated',
        `Your ${planName} subscription is now ${sub.status}. Manage billing at ${sitePath('/dashboard/billing')}.`,
      );
    } else if (event.type === 'customer.subscription.updated') {
      if (sub.cancel_at_period_end) {
        await queueBillingNotice(
          `subscription-cancel-at-period-end:${sub.id}:${sub.items.data[0]?.current_period_end || 'n'}`,
          user,
          'Subscription canceled',
          `Your ${planName} subscription will end at period close${periodEnd ? ` (${periodEnd})` : ''}. You can resubscribe anytime from ${sitePath('/pricing')}.`,
        );
      } else if (sub.status === 'active') {
        await queueBillingNotice(
          `subscription-updated-active:${sub.id}:${sub.items.data[0]?.current_period_end || 'n'}`,
          user,
          'Subscription renewed',
          `Your ${planName} subscription is active${periodEnd ? ` through ${periodEnd}` : ''}. Review invoices at ${sitePath('/dashboard/billing')}.`,
        );
      } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
        await queueBillingNotice(
          `subscription-expired:${sub.id}:${sub.status}`,
          user,
          'Subscription ended',
          `Your ${planName} subscription is ${sub.status}. Reactivate anytime at ${sitePath('/pricing')}.`,
        );
      }
    } else if (event.type === 'customer.subscription.deleted') {
      await queueBillingNotice(
        `subscription-deleted:${sub.id}`,
        user,
        'Subscription ended',
        `Your ${planName} subscription has ended. Reactivate anytime at ${sitePath('/pricing')}.`,
      );
    } else if (event.type === 'customer.subscription.trial_will_end' && sub.status === 'trialing') {
      await queueBillingNotice(
        `trial-ending:${sub.id}:${sub.trial_end}`,
        user,
        'Your trial is ending',
        `Your trial ends ${new Date(sub.trial_end! * 1000).toISOString()}. Your saved card will be charged automatically unless you cancel. Review the price or cancel at ${sitePath('/dashboard/billing')}.`,
      );
    }
  } else if (['invoice.payment_failed', 'invoice.payment_action_required'].includes(event.type)) {
    const invoiceId = (event.data.object as Stripe.Invoice).id;
    if (!invoiceId) throw new Error('Missing invoice ID.');
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (invoice.parent?.subscription_details?.metadata?.app !== 'chatbot-template') return;
    const user = await owner(invoice.customer);
    const amount =
      typeof invoice.amount_due === 'number'
        ? `$${(invoice.amount_due / 100).toFixed(2)} ${String(invoice.currency || 'usd').toUpperCase()}`
        : null;
    await queueBillingNotice(
      `${event.type}:${invoiceId}`,
      user,
      'Payment failed - action needed',
      `We could not complete your payment${amount ? ` (${amount})` : ''}. Access will not extend until payment is confirmed. Open ${sitePath('/dashboard/billing')} to update your card or authenticate the payment.`,
    );
  } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.app !== 'chatbot-template') return;
    if (
      session.metadata?.flow === 'workspace-credit-purchase' &&
      session.metadata.purchase_id &&
      session.metadata.user_id
    ) {
      await query(
        `update workspace_credit_purchases set status='failed'
         where id=$1 and user_id=$2 and status='pending'`,
        [session.metadata.purchase_id, session.metadata.user_id],
      );
    }
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    // Software ledger first. Failures must surface so Stripe retries.
    await applySoftwareStorefrontRefund(charge);
    try {
      const user = await owner(charge.customer);
      const amount =
        typeof charge.amount_refunded === 'number'
          ? `$${(charge.amount_refunded / 100).toFixed(2)} ${String(charge.currency || 'usd').toUpperCase()}`
          : null;
      await queueBillingNotice(
        `charge-refunded:${charge.id}:${charge.amount_refunded || 0}`,
        user,
        amount ? `Refund processed - ${amount}` : 'Refund processed',
        `A refund was issued to your original payment method${amount ? ` (${amount})` : ''}. It may take several business days to appear. View billing at ${sitePath('/dashboard/billing')}.`,
      );
    } catch {
      /* charge may not map to a known customer */
    }
  }
  // Failed/cancelled checkout, unpaid invoice and cancelled subscriptions grant nothing.
}

