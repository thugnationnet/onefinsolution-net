alter table chats add column area text not null default 'chat' check(area in ('chat','workspace'));
alter table chats add column pinned boolean not null default false;
alter table chats add column archived boolean not null default false;
alter table chats add column project text not null default '' check(length(project)<=100);
create index chats_organization on chats(user_id,area,pinned desc,updated_at desc);
create table message_feedback (
 message_id uuid primary key references messages(id) on delete cascade,
 user_id uuid not null references profiles(id) on delete cascade,
 rating text not null check(rating in ('positive','negative','report')),
 detail text not null default '' check(length(detail)<=2000), updated_at timestamptz not null default now()
);
alter table message_feedback enable row level security;
grant select,insert,update,delete on message_feedback to app_user;
create policy own_feedback on message_feedback to app_user
 using(user_id=app_user_id()) with check(user_id=app_user_id() and exists(select 1 from messages where id=message_id and user_id=app_user_id() and sender='ai'));
