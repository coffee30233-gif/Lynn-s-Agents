-- Lynn's Agents — Phase 5a schema
-- Paste this whole file into the Supabase SQL Editor and run it once.

create table if not exists conversations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  character_id  text not null,
  mode          text not null default 'chat',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations on delete cascade not null,
  role            text not null check (role in ('user', 'assistant')),
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

-- After running this:
-- 1. Authentication -> Providers -> make sure "Email" is enabled.
-- 2. Authentication -> URL Configuration -> add your dev and prod origins
--    (e.g. http://localhost:3000 and https://your-app.vercel.app) to
--    "Redirect URLs" so the magic link can redirect back to /auth/callback.
-- 3. Settings -> API -> copy "Project URL" and the "anon public" key into
--    .env.local as NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
