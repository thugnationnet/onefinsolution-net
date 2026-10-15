import 'server-only';
import type Stripe from 'stripe';
import { query } from './db';

export type StripeWebhookClaim =
  | { action: 'process'; attempts: number }
  | { action: 'skip_processed' }
  | { action: 'skip_in_flight' };

/** Stale `processing` rows may be reclaimed after a crash without a failure write. */
const STALE_PROCESSING_INTERVAL = '15 minutes';

function errorMessage(error: unknown) {
  // Avoid `instanceof Error` so messages still work across VM/test realms.
  const raw =
    error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
      ? (error as { message: string }).message
      : typeof error === 'string' && error
        ? error
        : 'Webhook processing failed.';
  return raw
    .replace(/\b(sk|rk|whsec)_(live|test)_[A-Za-z0-9]+\b/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]+\b/gi, 'Bearer [redacted]')
    .slice(0, 500);
}

/**
 * Atomically claim a Stripe event for processing.
 * - New event → process
 * - Already processed → skip (duplicate delivery)
 * - Failed (or stale processing) → reclaim and process
 * - In-flight processing → skip so Stripe retries
 */
export async function claimStripeWebhookEvent(event: Stripe.Event): Promise<StripeWebhookClaim> {
  const claimed = await query<{ event_id: string; attempts: number }>(
    `insert into stripe_webhook_events (
        event_id, event_type, livemode, status, attempts, received_at, updated_at
      ) values ($1, $2, $3, 'processing', 1, now(), now())
      on conflict (event_id) do update set
        event_type = excluded.event_type,
        livemode = excluded.livemode,
        status = 'processing',
        attempts = stripe_webhook_events.attempts + 1,
        last_error = null,
        updated_at = now()
      where stripe_webhook_events.status = 'failed'
         or (
           stripe_webhook_events.status = 'processing'
           and stripe_webhook_events.updated_at < now() - $4::interval
         )
      returning event_id, attempts`,
    [event.id, event.type, event.livemode, STALE_PROCESSING_INTERVAL],
  );

  if (claimed[0]) {
    return { action: 'process', attempts: claimed[0].attempts };
  }

  const existing = await query<{ status: string }>(
    `select status from stripe_webhook_events where event_id = $1`,
    [event.id],
  );
  const status = existing[0]?.status;
  if (status === 'processed') return { action: 'skip_processed' };
  return { action: 'skip_in_flight' };
}

/** Mark event successfully processed. No-op if not currently processing (safety). */
export async function markStripeWebhookEventProcessed(eventId: string) {
  await query(
    `update stripe_webhook_events
        set status = 'processed',
            processed_at = coalesce(processed_at, now()),
            last_error = null,
            updated_at = now()
      where event_id = $1
        and status = 'processing'`,
    [eventId],
  );
}

/** Record failure so Stripe retries can reclaim the event. */
export async function markStripeWebhookEventFailed(eventId: string, error: unknown) {
  await query(
    `update stripe_webhook_events
        set status = 'failed',
            last_error = $2,
            updated_at = now()
      where event_id = $1
        and status = 'processing'`,
    [eventId, errorMessage(error)],
  );
}
