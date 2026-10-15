-- SQL Script to set up the database schema for the Chat App

-- 1. Create the profiles table linked to auth.users
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  updated_at timestamp with time zone,
  username text unique,
  full_name text,
  avatar_url text,
  website text,
  enabled_models text[] default array['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']::text[], -- Added during ALTER steps below, included here for completeness
  selected_model text default 'claude-sonnet-4-6',            -- Added during ALTER steps below, included here for completeness
  constraint username_length check (char_length(username) >= 3)
);

-- 2. Set up Row Level Security (RLS) for profiles
alter table public.profiles enable row level security; 

-- 3. RLS Policies for profiles:
create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (auth.uid() = id);

create policy "Users can insert their own profile." on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on public.profiles
  for update using (auth.uid() = id);

-- Note: Columns enabled_models and selected_model were added via ALTER in original steps,
-- but are included in the initial CREATE TABLE above for simplicity in a single script.
-- If running ALTER separately, uncomment the lines below and remove from CREATE TABLE:
-- alter table public.profiles
--  add column enabled_models text[] default array['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']::text[];
-- alter table public.profiles
--    add column selected_model text; 

-- ==========================================================================
-- Chat Tables Setup
-- ==========================================================================

-- 1. Create the 'chats' table
CREATE TABLE public.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NULL, 
  model_id TEXT NULL, 
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for faster querying of a user's chats
CREATE INDEX idx_chats_user_id ON public.chats(user_id);

-- Enable Row Level Security (RLS) on the chats table
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- RLS policies for chats (Users can only access their own chats)
CREATE POLICY "Allow SELECT for own chats" ON public.chats
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Allow INSERT for own chats" ON public.chats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow UPDATE for own chats" ON public.chats
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow DELETE for own chats" ON public.chats
  FOR DELETE USING (auth.uid() = user_id);

-- 2. Create the 'messages' table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE, 
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, 
  sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')), 
  content TEXT NOT NULL, 
  model_id TEXT NULL, 
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for messages
CREATE INDEX idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

-- Enable Row Level Security (RLS) on the messages table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for messages
CREATE POLICY "Allow SELECT for messages in own chats" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.chats
      WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow INSERT for messages in own chats" ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chats
      WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()
    )
    AND auth.uid() = user_id
  );

CREATE POLICY "Allow UPDATE for own messages" ON public.messages
  FOR UPDATE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chats WHERE id = messages.chat_id AND user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chats WHERE id = messages.chat_id AND user_id = auth.uid()));

CREATE POLICY "Allow DELETE for own messages" ON public.messages
  FOR DELETE USING (auth.uid() = user_id);

-- ==========================================================================
-- Context Items Table Setup
-- ==========================================================================

-- Create the context_items table
CREATE TABLE context_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE context_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for context_items
CREATE POLICY "Allow users to view their own context items"
ON context_items
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert their own context items"
ON context_items
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own context items"
ON context_items
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own context items"
ON context_items
FOR DELETE
USING (auth.uid() = user_id);

-- Index on user_id for context_items
CREATE INDEX idx_context_items_user_id ON context_items(user_id);

-- ==========================================================================
-- Helper Functions and Triggers
-- ==========================================================================

-- Function to add a message and update the chat timestamp
CREATE OR REPLACE FUNCTION add_chat_message(
    p_chat_id UUID,
    p_user_id UUID,
    p_sender TEXT,
    p_content TEXT,
    p_model_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id OR NOT EXISTS (SELECT 1 FROM public.chats WHERE id = p_chat_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.messages (chat_id, user_id, sender, content, model_id)
  VALUES (p_chat_id, p_user_id, p_sender, p_content, p_model_id);

  UPDATE public.chats
  SET updated_at = now()
  WHERE id = p_chat_id AND user_id = p_user_id;

  RETURN;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION add_chat_message(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Function to update updated_at timestamp automatically (for context_items and potentially profiles)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for context_items
CREATE TRIGGER set_timestamp_context_items
BEFORE UPDATE ON context_items
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Trigger for profiles table (if you want updated_at to auto-update)
CREATE TRIGGER set_timestamp_profiles
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- ==========================================================================\
-- Trigger for Creating Profiles for New Users\
-- ==========================================================================\

-- Function to create a profile entry when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Important for accessing auth.users
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name', -- Attempt to get full_name from metadata
    NEW.raw_user_meta_data ->> 'avatar_url' -- Attempt to get avatar_url from metadata
  );
  RETURN NEW;
END;
$$;

-- Trigger to call the function after a new user is created in auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================================================\
-- End of Script\
-- ========================================================================== 