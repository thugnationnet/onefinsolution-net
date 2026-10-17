import 'server-only';
import type Stripe from 'stripe';
import { query, transaction } from './db';
import { verifiedStripe } from './stripe';
import { currentCustomer } from './stripe-billing';
import { approvedPrice } from './subscription-catalog';
import { resolvePresentmentCurrency } from './billing-currency';
import { findPlan } from './plans';
import { fulfillStripeEvent } from './stripe-fulfillment';
import { expectedStripeLivemode, stripeObjectMatchesMode } from './billing-environment';
import { requireOwnedPaymentMethod, stripePaymentMethodId } from './billing-scope';

type Enrollment = {
  user_id: string;
  request_id: string;
  plan_key: string;
  mode: 'trial' | 'paid';
  setup_id: string | null;
  subscription_id: string | null;
  price_id: string | null;
  trial_end: string | null;
  consent_at: Date | null;
  created_at: Date;
};

const objectId = (object: string | { id?: string } | null | undefined) =>
  typeof object === 'string' ? object : object?.id;

function invoicePaymentIntent(subscription: Stripe.Subscription): Stripe.PaymentIntent | null {
  const invoice = subscription.latest_invoice;
  if (!invoice || typeof invoice === 'string') return null;
  // Stripe SDK types vary by API version; read payment_intent via expanded object.
  const pi = (invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent | null }).payment_intent;
  if (!pi || typeof pi === 'string') return null;
  return pi;
}

function clientSecretFromSubscription(subscription: Stripe.Subscription): {
  clientSecret: string | null;
  confirmKind: 'payment' | 'setup';
} {
  const pi = invoicePaymentIntent(subscription);
  if (pi?.client_secret) {
    return { clientSecret: pi.client_secret, confirmKind: 'payment' };
  }
  const pending = subscription.pending_setup_intent;
  if (pending && typeof pending !== 'string' && pending.client_secret) {
    // Trial / $0 first invoice only — Stripe SetupIntent amount is 0. Not a $1/$2 hold.
    return { clientSecret: pending.client_secret, confirmKind: 'setup' };
  }
  return { clientSecret: null, confirmKind: 'payment' };
}

/**
 * One-step subscribe: create the real incomplete Subscription immediately.
 * - No separate SetupIntent save-card-first step
 * - No application-initiated $1/$2 authorization charges
 * - Customer confirms the real invoice PaymentIntent (paid) or Stripe $0 trial setup
 * - Payment method is saved as the subscription default on successful confirmation
 */
export async function prepareEnrollment(userId: string, key: string, mode: 'trial' | 'paid') {
  if (key === 'custom') {
    throw new Error('Custom plans are arranged with our team. Choose a standard plan or contact support.');
  }
  const plan = findPlan(key);
  const stripe = await verifiedStripe();
  const customer = await currentCustomer(true);
  if (!customer) throw new Error('Billing account unavailable.');

  const presentmentCurrency = await resolvePresentmentCurrency(stripe);
  const price = await approvedPrice(stripe, key, presentmentCurrency);

  const [resume] = await query<Enrollment>(
    'select * from billing_enrollments where user_id=$1 and plan_key=$2 and mode=$3',
    [userId, key, mode],
  );
  if (resume?.subscription_id) {
    try {
      const existing = await stripe.subscriptions.retrieve(resume.subscription_id, {
        expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
      });
      if (
        stripeObjectMatchesMode(existing.livemode) &&
        objectId(existing.customer) === customer &&
        ['incomplete', 'trialing', 'active'].includes(existing.status)
      ) {
        if (existing.status === 'trialing' || existing.status === 'active') {
          return {
            clientSecret: null as string | null,
            setupId: resume.request_id,
            confirmKind: 'payment' as const,
            subscriptionId: existing.id,
          };
        }
        const secrets = clientSecretFromSubscription(existing);
        if (secrets.clientSecret) {
          return {
            clientSecret: secrets.clientSecret,
            setupId: resume.request_id,
            confirmKind: secrets.confirmKind,
            subscriptionId: existing.id,
          };
        }
      }
    } catch {
      /* create new */
    }
  }

  const subscriptions = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
  if (subscriptions.data.some((sub) => !['canceled', 'incomplete_expired', 'incomplete'].includes(sub.status))) {
    throw new Error('You already have a subscription. Manage it from Plans & billing.');
  }
  for (const sub of subscriptions.data) {
    if (sub.status === 'incomplete' && sub.metadata?.app === 'chatbot-template') {
      try { await stripe.subscriptions.cancel(sub.id); } catch { /* ignore */ }
    }
  }

  if (mode === 'trial' && (await query('select 1 from billing_trial_claims where user_id=$1', [userId])).length) {
    throw new Error('Your free trial has already been used. Choose Subscribe without trial.');
  }

  const enrollment = await transaction(async (client) => {
    await client.query('select id from app_users where id=$1 for update', [userId]);
    const { rows } = await client.query<Enrollment>('select * from billing_enrollments where user_id=$1', [userId]);
    const previous = rows[0];
    if (previous?.consent_at && !previous.subscription_id) {
      throw new Error('A subscription request is awaiting confirmation. Return to the same plan to finish it.');
    }
    const result = await client.query<Enrollment>(
      `insert into billing_enrollments(user_id,plan_key,mode,price_id) values($1,$2,$3,$4)
      on conflict(user_id) do update set request_id=gen_random_uuid(),plan_key=$2,mode=$3,price_id=$4,setup_id=null,subscription_id=null,trial_end=null,consent_at=null,created_at=now() returning *`,
      [userId, key, mode, price.id],
    );
    return result.rows[0];
  });

  const trialEndUnix =
    mode === 'trial' && plan.trialDays > 0
      ? Math.floor(Date.now() / 1000) + plan.trialDays * 24 * 60 * 60
      : null;

  if (trialEndUnix) {
    await query('update billing_enrollments set trial_end=to_timestamp($1) where user_id=$2 and request_id=$3', [
      trialEndUnix, userId, enrollment.request_id,
    ]);
  }

  const subscription = await stripe.subscriptions.create(
    {
      customer,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      ...(trialEndUnix
        ? {
            trial_end: trialEndUnix,
            trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
          }
        : {}),
      metadata: {
        app: 'chatbot-template',
        plan_key: plan.key,
        enrollment_id: enrollment.request_id,
        app_user_id: userId,
        billing_scope: 'subscription',
        mode,
      },
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
    },
    { idempotencyKey: `onefin-subscription:${enrollment.request_id}` },
  );

  if (!stripeObjectMatchesMode(subscription.livemode) || objectId(subscription.customer) !== customer) {
    throw new Error('Unexpected billing account.');
  }

  const secrets = clientSecretFromSubscription(subscription);
  const handleId =
    invoicePaymentIntent(subscription)?.id ||
    (typeof subscription.pending_setup_intent === 'object' && subscription.pending_setup_intent
      ? subscription.pending_setup_intent.id
      : null) ||
    subscription.id;

  await query(
    `update billing_enrollments set subscription_id=$1, setup_id=$2 where user_id=$3 and request_id=$4`,
    [subscription.id, handleId, userId, enrollment.request_id],
  );

  if (!secrets.clientSecret && subscription.status !== 'active' && subscription.status !== 'trialing') {
    throw new Error('Unable to start checkout for this plan. Please try again.');
  }

  return {
    clientSecret: secrets.clientSecret,
    setupId: enrollment.request_id,
    confirmKind: secrets.confirmKind,
    subscriptionId: subscription.id,
  };
}

/**
 * Finalize after the customer confirms payment/setup on the real subscription.
 * setupId is the enrollment request_id returned from prepareEnrollment.
 */
export async function completeEnrollment(userId: string, setupId: string, consent: boolean) {
  if (!consent) throw new Error('Confirm the recurring payment terms before continuing.');
  if (!setupId) throw new Error('Missing enrollment reference.');

  const stripe = await verifiedStripe();
  const customer = await currentCustomer(true);
  if (!customer) throw new Error('Billing account unavailable.');

  const [enrollment] = await query<Enrollment>(
    `select * from billing_enrollments
     where user_id=$1
       and (request_id::text=$2 or setup_id=$2 or subscription_id=$2)
     order by created_at desc
     limit 1`,
    [userId, setupId],
  );
  if (!enrollment) throw new Error('Enrollment not found.');
  if (!enrollment.subscription_id) {
    throw new Error('Subscription was not started. Please begin checkout again.');
  }

  await query(
    'update billing_enrollments set consent_at=coalesce(consent_at, now()) where user_id=$1 and request_id=$2',
    [userId, enrollment.request_id],
  );

  const subscription = await stripe.subscriptions.retrieve(enrollment.subscription_id, {
    expand: ['latest_invoice.payment_intent', 'pending_setup_intent', 'default_payment_method'],
  });

  if (!stripeObjectMatchesMode(subscription.livemode) || objectId(subscription.customer) !== customer) {
    throw new Error('Unexpected billing account.');
  }

  if (subscription.status === 'incomplete' || subscription.status === 'incomplete_expired') {
    const secrets = clientSecretFromSubscription(subscription);
    if (secrets.clientSecret) {
      return {
        subscriptionId: subscription.id,
        status: subscription.status,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        paymentSecret: secrets.clientSecret,
      };
    }
    if (subscription.status === 'incomplete_expired') {
      throw new Error('This checkout expired. Please start again.');
    }
    throw new Error('Finish confirming your payment to activate the plan.');
  }

  if (!['active', 'trialing', 'past_due'].includes(subscription.status)) {
    throw new Error(`Subscription is ${subscription.status}. Please try a different card or contact support.`);
  }

  const pmId = stripePaymentMethodId(subscription.default_payment_method);
  if (pmId) {
    try {
      await requireOwnedPaymentMethod(stripe, customer, pmId);
      await stripe.customers.update(customer, {
        invoice_settings: { default_payment_method: pmId },
      });
    } catch {
      /* non-fatal */
    }
  }

  if (enrollment.mode === 'trial' && subscription.status === 'trialing') {
    try {
      await query('insert into billing_trial_claims(user_id) values($1) on conflict do nothing', [userId]);
    } catch {
      try {
      } catch {
        /* schema variants */
      }
    }
  }

  await fulfillStripeEvent(stripe, {
    type: 'customer.subscription.updated',
    livemode: expectedStripeLivemode(),
    data: { object: { id: subscription.id } },
  } as Stripe.Event);

  const invoiceId = objectId(subscription.latest_invoice);
  if (invoiceId) {
    const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['payment_intent'] });
    if (invoice.status === 'paid') {
      await fulfillStripeEvent(stripe, {
        type: 'invoice.paid',
        livemode: expectedStripeLivemode(),
        data: { object: { id: invoice.id } },
      } as Stripe.Event);
    }
  }

  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    paymentSecret: null as string | null,
  };
}
