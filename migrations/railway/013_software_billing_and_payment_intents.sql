create table software_billing_customers (
  user_id uuid primary key references app_users(id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table software_billing_profiles (
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

alter table software_storefront_purchases drop constraint software_storefront_purchases_pkey;
alter table software_storefront_purchases alter column stripe_checkout_session_id drop not null;
alter table software_storefront_purchases add column id uuid not null default gen_random_uuid();
alter table software_storefront_purchases add primary key (id);
alter table software_storefront_purchases add column user_id uuid references app_users(id) on delete restrict;
update software_storefront_purchases set customer_email = '' where customer_email is null;
alter table software_storefront_purchases alter column customer_email set not null;
alter table software_storefront_purchases drop constraint if exists software_storefront_purchases_status_check;
alter table software_storefront_purchases alter column status set default 'pending';
alter table software_storefront_purchases add constraint software_storefront_purchases_status_check check (status in ('pending', 'paid', 'failed'));
drop index if exists software_storefront_purchases_created_idx;
create index software_storefront_purchases_user_created_idx on software_storefront_purchases (user_id, created_at desc);
