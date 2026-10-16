-- Durable Stripe webhook event ledger / inbox.
-- Unique Stripe event IDs with processing state for idempotent delivery handling.
-- Backward-compatible: new table only; no changes to existing billing tables.
-- Idempotent: safe to re-run.

begin;

create table if not exists stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  status text not null check (status in ('processing', 'processed', 'failed')),
  attempts integer not null default 1 check (attempts >= 1),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_events_processed_at_check
    check (status <> 'processed' or processed_at is not null)
);

create index if not exists stripe_webhook_events_status_updated_idx
  on stripe_webhook_events (status, updated_at);

commit;
