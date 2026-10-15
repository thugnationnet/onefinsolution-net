-- Extended profile + address fields for Account settings dashboard.
alter table public.app_users
  add column if not exists name text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists company_name text,
  add column if not exists billing_name text,
  add column if not exists billing_line1 text,
  add column if not exists billing_line2 text,
  add column if not exists billing_city text,
  add column if not exists billing_state text,
  add column if not exists billing_postal text,
  add column if not exists billing_country text,
  add column if not exists shipping_name text,
  add column if not exists shipping_line1 text,
  add column if not exists shipping_line2 text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text,
  add column if not exists shipping_postal text,
  add column if not exists shipping_country text,
  add column if not exists shipping_same_as_billing boolean not null default true;

update public.app_users
set full_name = coalesce(nullif(full_name, ''), nullif(name, ''))
where full_name is null and name is not null;
