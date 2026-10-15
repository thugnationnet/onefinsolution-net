import { stripeClient, verifiedStripe } from '@/lib/stripe';
import { fulfillStripeEvent } from '@/lib/stripe-fulfillment';
import { fulfillSoftwareStorefrontPayment } from '@/lib/software-storefront-fulfillment';
import { stripeObjectMatchesMode } from '@/lib/billing-environment';
import {
  claimStripeWebhookEvent,
  markStripeWebhookEventFailed,
  markStripeWebhookEventProcessed,
} from '@/lib/stripe-webhook-ledger';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Webhook not configured.' }, { status: 503 });
  }
  const signature = request.headers.get('stripe-signature');
  if (!signature) return Response.json({ error: 'Missing signature.' }, { status: 400 });
  const body = await request.text();
  if (body.length > 1048576) return Response.json({ error: 'Payload too large.' }, { status: 413 });

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(body, signature, secret);
  } catch {
    return Response.json({ error: 'Invalid signature.' }, { status: 400 });
  }
  if (!stripeObjectMatchesMode(event.livemode)) {
    return Response.json({ error: 'Stripe event mode does not match this deployment.' }, { status: 400 });
  }

  if (![
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'invoice.paid',
    'invoice.payment_failed',
    'invoice.payment_action_required',
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.trial_will_end',
    'charge.refunded',
  ].includes(event.type)) {
    return Response.json({ received: true });
  }

  try {
    const claim = await claimStripeWebhookEvent(event);
    if (claim.action === 'skip_processed') {
      // Duplicate delivery of a completed event — never run fulfillment again.
      return Response.json({ received: true });
    }
    if (claim.action === 'skip_in_flight') {
      // Another worker is handling this event; ask Stripe to retry.
      return Response.json({ error: 'Webhook event is already being processed.' }, { status: 503 });
    }

    const stripe = await verifiedStripe();
    try {
      // Business fulfillment unchanged — ledger only gates entry/exit.
      await fulfillSoftwareStorefrontPayment(stripe, event);
      await fulfillStripeEvent(stripe, event);
    } catch (error) {
      await markStripeWebhookEventFailed(event.id, error);
      throw error;
    }

    await markStripeWebhookEventProcessed(event.id);
    return Response.json({ received: true });
  } catch {
    // A non-2xx response lets Stripe retry; ledger + business grants stay idempotent.
    console.error('Stripe webhook processing failed for event type:', event.type);
    return Response.json({ error: 'Webhook processing failed. Retry required.' }, { status: 503 });
  }
}
