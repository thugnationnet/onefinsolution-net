-- Allow refunded payment attempts + recompute purchase payment status after refunds.
-- Deposit accounting stays separate from inquiry/project status.

begin;

alter table software_storefront_payments
  drop constraint if exists software_storefront_payments_status_check;

alter table software_storefront_payments
  add constraint software_storefront_payments_status_check
  check (status in ('pending', 'succeeded', 'failed', 'canceled', 'refunded'));

-- Partial refunds keep amount_paid based on remaining succeeded payments only.
comment on column software_storefront_payments.status is
  'pending|succeeded|failed|canceled|refunded. Only succeeded rows count toward amount_paid_cents.';

commit;
