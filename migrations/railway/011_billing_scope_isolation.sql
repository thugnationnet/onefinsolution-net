begin;

create table workspace_billing_customers (
  user_id uuid primary key references app_users(id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);
alter table workspace_billing_customers enable row level security;
revoke all on workspace_billing_customers from public, app_user;

create table workspace_billing_profiles (
  user_id uuid primary key references app_users(id) on delete cascade,
  full_name text,
  phone text,
  company_name text,
  billing_name text,
  billing_line1 text,
  billing_line2 text,
  billing_city text,
  billing_state text,
  billing_postal text,
  billing_country text,
  shipping_name text,
  shipping_line1 text,
  shipping_line2 text,
  shipping_city text,
  shipping_state text,
  shipping_postal text,
  shipping_country text,
  shipping_same_as_billing boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table workspace_billing_profiles enable row level security;
create policy own_workspace_billing_profile on workspace_billing_profiles
  for all to app_user using (user_id = app_user_id()) with check (user_id = app_user_id());
revoke all on workspace_billing_profiles from public, app_user;
grant select, insert, update on workspace_billing_profiles to app_user;

create table workspace_account_settings (
  user_id uuid primary key references app_users(id) on delete cascade,
  theme text not null default 'system' check(theme in ('system','light','dark')),
  timezone text not null default 'Asia/Bangkok',
  enter_to_send boolean not null default true,
  spellcheck boolean not null default true,
  context_enabled boolean not null default true,
  product_updates boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table workspace_account_settings enable row level security;
create policy own_workspace_settings on workspace_account_settings
  for all to app_user using (user_id = app_user_id()) with check (user_id = app_user_id());
revoke all on workspace_account_settings from public, app_user;
grant select, insert, update on workspace_account_settings to app_user;

create table workspace_legacy_billing_customers (
  user_id uuid primary key references app_users(id) on delete cascade,
  customer_id text not null unique,
  recorded_at timestamptz not null default now()
);
alter table workspace_legacy_billing_customers enable row level security;
revoke all on workspace_legacy_billing_customers from public, app_user;

insert into workspace_legacy_billing_customers(user_id, customer_id)
select billing.user_id, billing.customer_id
from billing_customers billing
on conflict do nothing;

create table workspace_legacy_payment_methods (
  user_id uuid not null references app_users(id) on delete cascade,
  payment_method_id text not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, payment_method_id)
);
alter table workspace_legacy_payment_methods enable row level security;
revoke all on workspace_legacy_payment_methods from public, app_user;

insert into workspace_legacy_payment_methods(user_id, payment_method_id)
select user_id, payment_method_id
from workspace_credit_settings
where payment_method_id is not null
on conflict do nothing;

update workspace_credit_settings
set payment_method_id = null,
    card_brand = null,
    card_last4 = null,
    card_exp_month = null,
    card_exp_year = null,
    updated_at = now()
where payment_method_id is not null;

commit;
