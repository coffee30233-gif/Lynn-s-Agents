-- Lynn's Agents — Phase 5a schema
-- Paste this whole file into the Supabase SQL Editor and run it once.

create table if not exists conversations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users not null,
  -- Single-character chat: character_id is set, council_character_ids is null.
  -- Council session:       character_id is null, council_character_ids holds the panel.
  character_id          text,
  council_character_ids text[],
  mode                  text not null default 'chat',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations on delete cascade not null,
  role            text not null check (role in ('user', 'assistant')),
  -- Which character produced an assistant message in a council session
  -- ('synthesis' for the moderator's final answer). Null in 1:1 chats,
  -- where conversations.character_id already answers that question.
  character_id    text,
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists conversations_user_id_updated_at_idx
  on conversations (user_id, updated_at desc);

create index if not exists messages_conversation_id_created_at_idx
  on messages (conversation_id, created_at);

alter table conversations enable row level security;
alter table messages enable row level security;

-- Users can only ever see/modify their own conversations.
create policy "conversations_select_own" on conversations
  for select using (auth.uid() = user_id);
create policy "conversations_insert_own" on conversations
  for insert with check (auth.uid() = user_id);
create policy "conversations_update_own" on conversations
  for update using (auth.uid() = user_id);
create policy "conversations_delete_own" on conversations
  for delete using (auth.uid() = user_id);

-- Messages are scoped through the parent conversation's ownership.
create policy "messages_select_own" on messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
create policy "messages_insert_own" on messages
  for insert with check (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- Migration: Multi-Agent Council support.
-- Already ran this file before Council existed? Run just this block —
-- it's safe to re-run and safe to run on a fresh database too.
alter table conversations alter column character_id drop not null;
alter table conversations add column if not exists council_character_ids text[];
alter table messages add column if not exists character_id text;

-- After running this:
-- 1. Authentication -> Providers -> make sure "Email" is enabled.
-- 2. Authentication -> URL Configuration -> add your dev and prod origins
--    (e.g. http://localhost:3000 and https://your-app.vercel.app) to
--    "Redirect URLs" so the magic link can redirect back to /auth/callback.
-- 3. Settings -> API -> copy "Project URL" and the "anon public" key into
--    .env.local as NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
