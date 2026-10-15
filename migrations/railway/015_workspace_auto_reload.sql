-- Workspace Credits auto-reload (low-balance top-up).
-- Uses existing workspace_billing_customers + workspace_credit_settings payment method.
-- This file is intentionally not applied by the agent; apply after review.

begin;

alter table workspace_credit_settings
  add column if not exists auto_reload_enabled boolean not null default false;

alter table workspace_credit_settings
  add column if not exists auto_reload_threshold integer not null default 1
    check (auto_reload_threshold >= 0 and auto_reload_threshold <= 1000000);

-- Optional cooldown / diagnostics for failed off-session charges.
alter table workspace_credit_settings
  add column if not exists last_auto_reload_at timestamptz;

alter table workspace_credit_settings
  add column if not exists last_auto_reload_error text;

alter table workspace_credit_settings
  add column if not exists last_auto_reload_payment_intent text;

comment on column workspace_credit_settings.auto_reload_enabled is
  'When true, Workspace may charge the saved Workspace payment method off-session after low balance.';
comment on column workspace_credit_settings.auto_reload_threshold is
  'Trigger when available credits are less than or equal to this value (after a spend).';

-- Track auto-reload origin on purchases (nullable for legacy manual rows).
alter table workspace_credit_purchases
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'auto_reload'));

create index if not exists workspace_credit_purchases_user_source_idx
  on workspace_credit_purchases (user_id, source, created_at desc);

commit;
