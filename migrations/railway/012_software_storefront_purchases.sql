create table software_storefront_purchases (
  stripe_checkout_session_id text primary key,
  stripe_payment_intent_id text unique,
  item_kind text not null check (item_kind in ('template', 'software')),
  item_id text not null,
  item_name text not null,
  customer_email text,
  amount_paid_cents integer not null check (amount_paid_cents >= 500),
  total_price_cents integer not null check (total_price_cents >= amount_paid_cents),
  currency char(3) not null check (currency = 'usd'),
  status text not null check (status in ('pending', 'paid')),
  team_notified_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index software_storefront_purchases_created_idx
  on software_storefront_purchases (created_at desc);
