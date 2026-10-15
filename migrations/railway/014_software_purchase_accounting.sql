-- Software purchase accounting: agreed price vs payments, installment ledger.
-- Do not treat a deposit as full payment. Payment status stays separate from inquiry/project status.
-- This file is intentionally not applied by the agent; apply in the target environment after review.

begin;

-- Allow $0 total paid before any successful payment (pending purchase / open balance).
alter table software_storefront_purchases
  drop constraint if exists software_storefront_purchases_amount_paid_cents_check;

alter table software_storefront_purchases
  add constraint software_storefront_purchases_amount_paid_cents_check
  check (amount_paid_cents >= 0);

-- Payment status on the purchase (not project/inquiry status).
alter table software_storefront_purchases
  drop constraint if exists software_storefront_purchases_status_check;

alter table software_storefront_purchases
  add constraint software_storefront_purchases_status_check
  check (status in ('pending', 'partially_paid', 'paid', 'failed'));

-- Project / inquiry workflow status (independent of payment status).
alter table software_storefront_purchases
  add column if not exists inquiry_status text not null default 'inquiry';

alter table software_storefront_purchases
  drop constraint if exists software_storefront_purchases_inquiry_status_check;

alter table software_storefront_purchases
  add constraint software_storefront_purchases_inquiry_status_check
  check (
    inquiry_status in (
      'inquiry',
      'in_discussion',
      'in_progress',
      'ready_for_handover',
      'completed',
      'cancelled'
    )
  );

-- Optional catalog estimate snapshot (min-max). Agreed total remains total_price_cents.
alter table software_storefront_purchases
  add column if not exists estimated_min_cents integer
    check (estimated_min_cents is null or estimated_min_cents > 0);

alter table software_storefront_purchases
  add column if not exists estimated_max_cents integer
    check (
      estimated_max_cents is null
      or (
        estimated_max_cents > 0
        and (estimated_min_cents is null or estimated_max_cents >= estimated_min_cents)
      )
    );

comment on column software_storefront_purchases.total_price_cents is
  'Agreed project price in cents. Drives remaining balance; not overwritten by installment amounts.';
comment on column software_storefront_purchases.amount_paid_cents is
  'Sum of successfully verified payments only. Failed/cancelled/pending amounts are excluded.';
comment on column software_storefront_purchases.status is
  'Payment status: pending | partially_paid | paid | failed. Separate from inquiry_status.';
comment on column software_storefront_purchases.inquiry_status is
  'Project/inquiry workflow status. Independent of payment status.';

-- One row per Stripe payment attempt / installment against a purchase.
create table if not exists software_storefront_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references software_storefront_purchases(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  status text not null check (status in ('pending', 'succeeded', 'failed', 'canceled')),
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  initiated_by text not null default 'customer'
    check (initiated_by in ('customer', 'company')),
  failure_message text,
  created_at timestamptz not null default now(),
  succeeded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint software_storefront_payments_succeeded_at_check check (
    (status = 'succeeded' and succeeded_at is not null)
    or (status <> 'succeeded')
  )
);

create index if not exists software_storefront_payments_purchase_idx
  on software_storefront_payments (purchase_id, created_at desc);

create index if not exists software_storefront_payments_user_idx
  on software_storefront_payments (user_id, created_at desc);

create index if not exists software_storefront_payments_status_idx
  on software_storefront_payments (status, updated_at desc);

-- Existing rows that were marked paid only because a deposit succeeded, but totals still
-- show remaining balance, become partially_paid. Fully covered rows stay paid.
update software_storefront_purchases
set status = 'partially_paid'
where status = 'paid'
  and amount_paid_cents > 0
  and amount_paid_cents < total_price_cents;

update software_storefront_purchases
set status = 'paid',
    paid_at = coalesce(paid_at, now())
where amount_paid_cents > 0
  and amount_paid_cents >= total_price_cents
  and status <> 'paid';

-- Seed ledger from legacy single-PI purchases so history is not empty after migrate.
insert into software_storefront_payments (
  purchase_id,
  user_id,
  amount_cents,
  currency,
  status,
  stripe_payment_intent_id,
  initiated_by,
  created_at,
  succeeded_at,
  updated_at
)
select
  p.id,
  p.user_id,
  greatest(p.amount_paid_cents, 1),
  p.currency,
  case
    when p.status = 'paid' or p.status = 'partially_paid' then 'succeeded'
    when p.status = 'failed' then 'failed'
    else 'pending'
  end,
  p.stripe_payment_intent_id,
  'customer',
  p.created_at,
  case
    when p.status in ('paid', 'partially_paid') then coalesce(p.paid_at, p.created_at)
    else null
  end,
  coalesce(p.paid_at, p.created_at)
from software_storefront_purchases p
where p.stripe_payment_intent_id is not null
  and p.amount_paid_cents > 0
on conflict (stripe_payment_intent_id) do nothing;

commit;
