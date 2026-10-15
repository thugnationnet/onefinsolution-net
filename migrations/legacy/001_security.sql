-- Apply to an existing Supabase project after setup_db.sql.
-- Does not delete any profiles, messages, chats, or contexts.
begin;
alter table public.profiles alter column enabled_models set default array['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']::text[];
alter table public.profiles alter column selected_model set default 'claude-sonnet-4-6';
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Allow UPDATE for own messages" on public.messages;
create policy "Allow UPDATE for own messages" on public.messages for update to authenticated
using (auth.uid() = user_id and exists (select 1 from public.chats where id = messages.chat_id and user_id = auth.uid()))
with check (auth.uid() = user_id and exists (select 1 from public.chats where id = messages.chat_id and user_id = auth.uid()));
create or replace function public.add_chat_message(
  p_chat_id uuid, p_user_id uuid, p_sender text, p_content text, p_model_id text default null
) returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id or not exists (
    select 1 from public.chats where id = p_chat_id and user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;
  insert into public.messages (chat_id, user_id, sender, content, model_id)
    values (p_chat_id, p_user_id, p_sender, p_content, p_model_id);
  update public.chats set updated_at = now() where id = p_chat_id and user_id = auth.uid();
end;
$$;
revoke all on function public.add_chat_message(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.add_chat_message(uuid, uuid, text, text, text) to authenticated;
-- Repair profiles for historical auth users without changing existing records.
insert into public.profiles (id, full_name, avatar_url)
select id, raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'avatar_url' from auth.users
on conflict (id) do nothing;
commit;
