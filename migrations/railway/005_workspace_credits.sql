begin;

create table public.chat_usage (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  status text not null check (status in ('completed')),
  model_id text not null,
  created_at timestamptz not null default now()
);
create index chat_usage_owner_recent on public.chat_usage(user_id, created_at desc);
alter table public.chat_usage enable row level security;
create policy own_chat_usage on public.chat_usage for select to app_user using (user_id = public.app_user_id());
revoke all on public.chat_usage from public,app_user;
grant select on public.chat_usage to app_user;

create table public.workspace_credit_settings (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  payment_method_id text,
  card_brand text,
  card_last4 text,
  card_exp_month integer,
  card_exp_year integer,
  updated_at timestamptz not null default now(),
  check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  check (card_exp_month is null or card_exp_month between 1 and 12)
);
alter table public.workspace_credit_settings enable row level security;
create policy own_workspace_credit_settings on public.workspace_credit_settings for select to app_user using (user_id = public.app_user_id());
revoke all on public.workspace_credit_settings from public,app_user;
grant select on public.workspace_credit_settings to app_user;

create table public.workspace_credit_purchases (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  stripe_payment_intent text unique,
  amount integer not null check (amount > 0),
  credits integer not null check (credits > 0),
  status text not null check (status in ('pending','succeeded','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index workspace_credit_purchases_owner_recent on public.workspace_credit_purchases(user_id, created_at desc);
alter table public.workspace_credit_purchases enable row level security;
create policy own_workspace_credit_purchases on public.workspace_credit_purchases for select to app_user using (user_id = public.app_user_id());
revoke all on public.workspace_credit_purchases from public,app_user;
grant select on public.workspace_credit_purchases to app_user;

create table public.workspace_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  purchase_id uuid not null unique references public.workspace_credit_purchases(id),
  stripe_payment_intent text not null unique,
  amount integer not null check (amount > 0),
  currency text not null check (currency = 'usd'),
  credits integer not null check (credits > 0),
  created_at timestamptz not null default now()
);
create index workspace_credit_transactions_owner_recent on public.workspace_credit_transactions(user_id, created_at desc);
alter table public.workspace_credit_transactions enable row level security;
create policy own_workspace_credit_transactions on public.workspace_credit_transactions for select to app_user using (user_id = public.app_user_id());
revoke all on public.workspace_credit_transactions from public,app_user;
grant select on public.workspace_credit_transactions to app_user;

commit;
