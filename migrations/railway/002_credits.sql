-- Native PostgreSQL credit accounting, ported from the tested credit migration.
begin;
create table if not exists public.billing_customers (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.billing_subscriptions (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  price_id text not null,
  status text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  cancel_at_period_end boolean not null,
  observed_at timestamptz not null default now()
);
alter table public.billing_subscriptions enable row level security;
drop policy if exists own_subscription_records on public.billing_subscriptions;
create policy own_subscription_records on public.billing_subscriptions for select to app_user using (user_id = public.app_user_id());
revoke all on public.billing_subscriptions from public,app_user;
grant select on public.billing_subscriptions to app_user;
create table if not exists public.credit_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  reference text not null unique,
  total bigint not null check (total > 0),
  remaining bigint not null check (remaining >= 0 and remaining <= total),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.billing_checkout_attempts (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  request_id uuid not null unique default gen_random_uuid(),
  price_id text not null,
  session_id text,
  created_at timestamptz not null default now()
);
alter table public.billing_checkout_attempts enable row level security;
revoke all on public.billing_checkout_attempts from public,app_user;
create or replace function public.begin_billing_checkout(p_user uuid,p_price text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare attempt public.billing_checkout_attempts;
begin
  perform 1 from public.app_users where id=p_user for update;
  if not found then raise exception 'Unknown user'; end if;
  insert into public.billing_checkout_attempts(user_id,price_id) values(p_user,p_price) on conflict(user_id) do nothing;
  select * into attempt from public.billing_checkout_attempts where user_id=p_user;
  return to_jsonb(attempt);
end; $$;
revoke all on function public.begin_billing_checkout(uuid,text) from public,app_user;
create index if not exists credit_buckets_user on public.credit_buckets(user_id, expires_at);
create table if not exists public.credit_usage (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  status text not null check (status in ('reserved','completed','refunded')),
  created_at timestamptz not null default now()
);
create table if not exists public.credit_allocations (
  usage_id uuid not null references public.credit_usage(id),
  bucket_id uuid not null references public.credit_buckets(id),
  amount bigint not null check (amount > 0),
  primary key (usage_id,bucket_id)
);
alter table public.billing_customers enable row level security;
alter table public.credit_buckets enable row level security;
alter table public.credit_usage enable row level security;
alter table public.credit_allocations enable row level security;
drop policy if exists own_billing_customer on public.billing_customers;
create policy own_billing_customer on public.billing_customers for select to app_user using (user_id = public.app_user_id());
drop policy if exists own_credit_buckets on public.credit_buckets;
create policy own_credit_buckets on public.credit_buckets for select to app_user using (user_id = public.app_user_id());
drop policy if exists own_credit_usage on public.credit_usage;
create policy own_credit_usage on public.credit_usage for select to app_user using (user_id = public.app_user_id());
-- No browser role can grant, spend, or refund credits directly.
revoke all on public.billing_customers,public.credit_buckets,public.credit_usage,public.credit_allocations from public,app_user;
grant select on public.billing_customers,public.credit_buckets,public.credit_usage to app_user;
create or replace function public.available_credits(p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining),0)::bigint from public.credit_buckets
    where user_id = p_user and (expires_at is null or expires_at > now());
$$;
revoke all on function public.available_credits(uuid) from public,app_user;

create or replace function public.grant_credits(p_user uuid,p_reference text,p_amount bigint,p_expires timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare existing public.credit_buckets;
begin
  if p_amount <= 0 or p_amount > 100000000 then raise exception 'Invalid credit grant'; end if;
  perform 1 from public.app_users where id = p_user for update;
  if not found then raise exception 'Unknown user'; end if;
  select * into existing from public.credit_buckets where reference = p_reference;
  if found then
    if existing.user_id <> p_user or existing.total <> p_amount or existing.expires_at is distinct from p_expires then
      raise exception 'Conflicting credit grant';
    end if;
    return;
  end if;
  insert into public.credit_buckets(user_id,reference,total,remaining,expires_at)
    values(p_user,p_reference,p_amount,p_amount,p_expires);
end; $$;

create or replace function public.reconcile_credit_usage(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare usage record; allocation record;
begin
  perform 1 from public.app_users where id = p_user for update;
  for usage in select id from public.credit_usage where user_id = p_user and status = 'reserved'
    and created_at < now() - interval '10 minutes' for update loop
    for allocation in select * from public.credit_allocations where usage_id = usage.id loop
      update public.credit_buckets set remaining = remaining + allocation.amount where id = allocation.bucket_id;
    end loop;
    update public.credit_usage set status = 'refunded' where id = usage.id;
  end loop;
end; $$;

create or replace function public.reserve_credits(p_user uuid,p_request uuid,p_cost bigint)
returns void language plpgsql security definer set search_path = public as $$
declare bucket record; needed bigint := p_cost; take bigint; available bigint;
begin
  if p_cost <= 0 or p_cost > 100000000 then raise exception 'Invalid credit cost'; end if;
  -- The user lock serializes reservations, grants and refunds across requests.
  perform 1 from public.app_users where id = p_user for update;
  if not found then raise exception 'Unknown user'; end if;
  perform public.reconcile_credit_usage(p_user);
  if exists(select 1 from public.credit_usage where id = p_request) then raise exception 'Duplicate request'; end if;
  select coalesce(sum(remaining),0) into available from public.credit_buckets
    where user_id = p_user and (expires_at is null or expires_at > now());
  if available < p_cost then raise exception 'Insufficient credits'; end if;
  insert into public.credit_usage(id,user_id,status) values(p_request,p_user,'reserved');
  for bucket in select * from public.credit_buckets where user_id = p_user and remaining > 0
    and (expires_at is null or expires_at > now()) order by expires_at asc nulls last,created_at,id for update loop
    take := least(needed,bucket.remaining);
    update public.credit_buckets set remaining = remaining - take where id = bucket.id;
    insert into public.credit_allocations(usage_id,bucket_id,amount) values(p_request,bucket.id,take);
    needed := needed - take;
    exit when needed = 0;
  end loop;
end; $$;

create or replace function public.finish_credit_usage(p_user uuid,p_request uuid,p_success boolean)
returns void language plpgsql security definer set search_path = public as $$
declare usage public.credit_usage; allocation record;
begin
  perform 1 from public.app_users where id = p_user for update;
  select * into usage from public.credit_usage where id = p_request and user_id = p_user for update;
  if not found then raise exception 'Unknown request'; end if;
  if usage.status <> 'reserved' then return; end if;
  if not p_success then
    for allocation in select * from public.credit_allocations where usage_id = p_request loop
      update public.credit_buckets set remaining = remaining + allocation.amount where id = allocation.bucket_id;
    end loop;
  end if;
  update public.credit_usage set status = case when p_success then 'completed' else 'refunded' end where id = p_request;
end; $$;
revoke all on function public.grant_credits(uuid,text,bigint,timestamptz) from public,app_user;
revoke all on function public.reserve_credits(uuid,uuid,bigint) from public,app_user;
revoke all on function public.finish_credit_usage(uuid,uuid,boolean) from public,app_user;
revoke all on function public.reconcile_credit_usage(uuid) from public,app_user;
commit;