-- Native Railway PostgreSQL. No Supabase roles, schemas or extensions required.
create table app_users (
 id uuid primary key default gen_random_uuid(), email text not null unique check(email=lower(email)),
 password_hash text not null, email_verified_at timestamptz, created_at timestamptz not null default now()
);
create table app_sessions(token_hash text primary key,user_id uuid not null references app_users(id) on delete cascade,expires_at timestamptz not null,created_at timestamptz not null default now());
create index app_sessions_user on app_sessions(user_id);
create index app_sessions_expiry on app_sessions(expires_at);
create table auth_tokens(token_hash text primary key,user_id uuid not null references app_users(id) on delete cascade,purpose text not null check(purpose in ('verify','reset')),expires_at timestamptz not null);
create index auth_tokens_user on auth_tokens(user_id);
create table auth_rate_limits(key text primary key,attempts integer not null,expires_at timestamptz not null);
create table profiles(id uuid primary key references app_users(id) on delete cascade,full_name text,username text unique,avatar_url text,website text,enabled_models text[] not null default array['default'],selected_model text default 'default',updated_at timestamptz not null default now());
create table chats(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles(id) on delete cascade,name text,model_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index idx_chats_user on chats(user_id,updated_at desc);
create table messages(id uuid primary key default gen_random_uuid(),chat_id uuid not null references chats(id) on delete cascade,user_id uuid not null references profiles(id) on delete cascade,sender text not null check(sender in ('user','ai')),content text not null,model_id text,created_at timestamptz not null default now());
create index idx_messages_chat on messages(chat_id,created_at);
create table context_items(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles(id) on delete cascade,name text not null,content text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index idx_context_user on context_items(user_id);
do $$ begin if not exists(select 1 from pg_roles where rolname='app_user') then create role app_user nologin; end if; end $$;
grant app_user to current_user;
grant usage on schema public to app_user;
grant select,insert,update,delete on profiles,chats,messages,context_items to app_user;
create function app_user_id() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
alter table profiles enable row level security;
create policy own_profile on profiles to app_user using(id=app_user_id()) with check(id=app_user_id());
alter table chats enable row level security;
create policy own_chats on chats to app_user using(user_id=app_user_id()) with check(user_id=app_user_id());
alter table context_items enable row level security;
create policy own_context on context_items to app_user using(user_id=app_user_id()) with check(user_id=app_user_id());
alter table messages enable row level security;
create policy own_messages on messages to app_user using(user_id=app_user_id() and exists(select 1 from chats where id=messages.chat_id and user_id=app_user_id())) with check(user_id=app_user_id() and exists(select 1 from chats where id=messages.chat_id and user_id=app_user_id()));
revoke all on app_users,app_sessions,auth_tokens,auth_rate_limits from public,app_user;
