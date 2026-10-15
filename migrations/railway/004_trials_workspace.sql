begin;
create table billing_enrollments (
 user_id uuid primary key references app_users(id) on delete cascade,
 request_id uuid not null unique default gen_random_uuid(),
 plan_key text not null check(plan_key in ('daily','weekly','monthly','yearly')),
 mode text not null check(mode in ('trial','paid')),
 setup_id text, subscription_id text, price_id text,
 trial_end bigint, consent_at timestamptz, created_at timestamptz not null default now()
);
create table billing_trial_claims (
 user_id uuid primary key references app_users(id),
 card_hash text not null unique,
 request_id uuid not null unique,
 created_at timestamptz not null default now()
);
create table membership_access (
 subscription_id text primary key,
 user_id uuid not null references app_users(id) on delete cascade,
 plan_key text not null,
 expires_at timestamptz not null,
 updated_at timestamptz not null default now()
);
create index membership_access_owner on membership_access(user_id,expires_at);
create table billing_notices (
 reference text primary key,
 user_id uuid not null references app_users(id) on delete cascade,
 subject text not null, body text not null,
 created_at timestamptz not null default now(), sent_at timestamptz,
 attempts integer not null default 0, locked_until timestamptz
);
create table visitor_usage (
 identity_hash text not null, day date not null,
 used integer not null default 0 check(used>=0),
 primary key(identity_hash,day)
);
create table visitor_requests (
 id uuid primary key, identities text[] not null,
 day date not null, status text not null check(status in ('reserved','completed','refunded')),
 created_at timestamptz not null default now()
);
create index visitor_requests_date on visitor_requests(created_at);
alter table billing_subscriptions add column next_plan_key text;
alter table billing_subscriptions add column next_plan_at timestamptz;
alter table billing_subscriptions add column trial_end timestamptz;
alter table membership_access enable row level security;
create policy own_membership on membership_access for select to app_user using(user_id=app_user_id());
revoke all on billing_enrollments,billing_trial_claims,membership_access,billing_notices,visitor_usage,visitor_requests from public,app_user;
grant select on membership_access to app_user;
commit;
