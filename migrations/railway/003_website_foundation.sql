-- Account preferences and support requests. Existing account and billing IDs are preserved.
create table account_settings (
  user_id uuid primary key references app_users(id) on delete cascade,
  theme text not null default 'system' check(theme in ('system','light','dark')),
  timezone text not null default 'Asia/Bangkok',
  enter_to_send boolean not null default true,
  spellcheck boolean not null default true,
  context_enabled boolean not null default true,
  product_updates boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table account_settings enable row level security;
create policy own_settings on account_settings to app_user using(user_id=app_user_id()) with check(user_id=app_user_id());
revoke all on account_settings from public;
grant select,insert,update on account_settings to app_user;

create table support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  name text not null check(length(name) between 1 and 120),
  email text not null check(length(email) between 3 and 254),
  category text not null check(category in ('general','technical','billing','privacy','account','pricing')),
  subject text not null check(length(subject) between 3 and 160),
  message text not null check(length(message) between 20 and 6000),
  status text not null default 'open' check(status in ('open','in_progress','resolved')),
  response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_requests_owner on support_requests(user_id,created_at desc);
alter table support_requests enable row level security;
create policy own_support_requests on support_requests for select to app_user using(user_id=app_user_id());
revoke all on support_requests from public,app_user;
grant select on support_requests to app_user;
