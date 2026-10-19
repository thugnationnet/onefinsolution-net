import 'server-only';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { query, transaction } from './db';
import { verifiedStripe } from './stripe';
import { currentCustomer } from './stripe-billing';
import { approvedPrice } from './subscription-catalog';
import { findPlan } from './plans';
import { fulfillStripeEvent } from './stripe-fulfillment';
import { stripeObjectMatchesMode } from './billing-environment';
import { sitePath } from './site-url';

/** One open Checkout per account; starting checkout never activates a trial. */
export async function prepareEnrollment(userId: string, key: string, mode: 'trial' | 'paid') {
  const plan = findPlan(key);
  if (key === 'custom') throw new Error('Contact our team for a custom plan.');
  const stripe = verifiedStripe();
  const customer = await currentCustomer(true);
  if (!customer) throw new Error('Billing account unavailable.');
  const price = await approvedPrice(stripe, key);

  return transaction(async client => {
    await client.query('select id from app_users where id=$1 for update', [userId]);
    const existing = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
    if (existing.has_more || existing.data.some(sub => !['canceled', 'incomplete_expired'].includes(sub.status))) {
      throw new Error('You already have a subscription or unfinished payment. Manage it in Plan & billing.');
    }
    if (mode === 'trial' && (await client.query('select 1 from billing_trial_claims where user_id=$1', [userId])).rows.length) {
      throw new Error('Your free trial has already been used. Choose Subscribe & pay.');
    }
    const { rows } = await client.query<{ setup_id: string | null; plan_key: string; mode: string }>(
      'select setup_id,plan_key,mode from billing_enrollments where user_id=$1', [userId],
    );
    const previous = rows[0];
    if (previous?.setup_id?.startsWith('cs_')) {
      const session = await stripe.checkout.sessions.retrieve(previous.setup_id);
      if (session.customer !== customer || !stripeObjectMatchesMode(session.livemode)) throw new Error('Checkout account mismatch.');
      if (session.status === 'complete' && session.subscription) {
        const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(id);
        if (!['canceled', 'incomplete_expired'].includes(sub.status)) throw new Error('Your checkout completed. Return to Plan & billing.');
      }
      if (session.status === 'open') {
        if (previous.plan_key === key && previous.mode === mode && session.client_secret) {
          return { clientSecret: session.client_secret, sessionId: session.id };
        }
        await stripe.checkout.sessions.expire(session.id);
      }
    }
    const requestId = randomUUID();
    const metadata = {
      app: 'chatbot-template', billing_scope: 'subscription', flow: 'subscription-checkout',
      user_id: userId, app_user_id: userId, enrollment_id: requestId, plan_key: key, mode,
    };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ui_mode: 'form',
      customer,
      client_reference_id: userId,
      line_items: [{ price: price.id, quantity: 1 }],
      billing_address_collection: 'auto',
      payment_method_collection: 'always',
      submit_type: 'auto',
      integration_identifier: 'custom_embedded_web_0002',
      saved_payment_method_options: { payment_method_save: 'enabled' },
      return_url: sitePath(`/subscribe/return?session_id={CHECKOUT_SESSION_ID}`),
      subscription_data: {
        metadata,
        ...(mode === 'trial' ? {
          trial_period_days: plan.trialDays,
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
        } : {}),
      },
      metadata,
    }, { idempotencyKey: `subscription-checkout:${requestId}` });
    if (!session.client_secret || !stripeObjectMatchesMode(session.livemode)) throw new Error('Checkout is unavailable.');
    await client.query(
      `insert into billing_enrollments(user_id,request_id,plan_key,mode,price_id,setup_id)
       values($1,$2,$3,$4,$5,$6) on conflict(user_id) do update set
       request_id=$2,plan_key=$3,mode=$4,price_id=$5,setup_id=$6,subscription_id=null,
       trial_end=null,consent_at=null,created_at=now()`,
      [userId, requestId, key, mode, price.id, session.id],
    );
    return { clientSecret: session.client_secret, sessionId: session.id };
  });
}

/** Return-page reconciliation uses the same verified fulfillment as webhooks. */
export async function completeEnrollment(userId: string, sessionId: string) {
  if (!/^cs_(live|test)_[a-zA-Z0-9]+$/.test(sessionId)) throw new Error('Invalid checkout reference.');
  const stripe = verifiedStripe();
  const customer = await currentCustomer();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (!customer || session.customer !== customer || !stripeObjectMatchesMode(session.livemode) ||
      session.metadata?.billing_scope !== 'subscription' || session.metadata.user_id !== userId ||
      session.client_reference_id !== userId) throw new Error('Checkout not found.');
  if (session.status !== 'complete') return { status: 'pending' as const };
  if (!['paid', 'no_payment_required'].includes(session.payment_status)) return { status: 'pending' as const };
  await fulfillStripeEvent(stripe, {
    type: 'checkout.session.completed', livemode: session.livemode, data: { object: { id: session.id } },
  } as Stripe.Event);
  if (session.mode === 'subscription') {
    const id = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    const [record] = await query('select status from billing_subscriptions where id=$1 and user_id=$2', [id, userId]);
    if (!record || !['active', 'trialing'].includes(record.status)) return { status: 'pending' as const };
  }
  return { status: 'complete' as const };
}
