-- Store Stripe receipt/invoice links for payment history UIs.
begin;

alter table if exists software_storefront_payments
  add column if not exists receipt_url text;

alter table if exists software_storefront_payments
  add column if not exists receipt_number text;

alter table if exists workspace_credit_transactions
  add column if not exists receipt_url text;

alter table if exists workspace_credit_purchases
  add column if not exists receipt_url text;

comment on column software_storefront_payments.receipt_url is
  'Stripe charge receipt URL when available.';
comment on column workspace_credit_transactions.receipt_url is
  'Stripe charge receipt URL when available.';

commit;
