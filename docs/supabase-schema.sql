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
  -- Google Search grounding sources for this reply, when Gemini used any:
  -- [{ "title": "...", "uri": "https://..." }]. Null/empty on most turns.
  sources         jsonb,
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

-- Migration: Web Search source citations. Same rules as above — safe to
-- re-run, safe on a fresh database.
alter table messages add column if not exists sources jsonb;

-- Migration: Saved plans ("儲存為行程"). Same rules as above — safe to
-- re-run, safe on a fresh database.
create table if not exists plans (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users not null,
  title                   text not null,
  -- Free-text location keyword the user typed at save time — used to build
  -- a Google Maps search link, not parsed out of the AI's reply.
  location                text,
  -- The activity's actual date (user-entered at save time, like location) —
  -- separate from created_at, which is just when the plan was saved.
  event_date              date,
  content                 text not null,
  -- Google Search grounding sources carried over from the chat message this
  -- plan was saved from — [{ "title": "...", "uri": "https://..." }].
  sources                 jsonb,
  source_conversation_id  uuid references conversations on delete set null,
  created_at              timestamptz not null default now()
);

alter table plans add column if not exists event_date date;
alter table plans add column if not exists sources jsonb;

create index if not exists plans_user_id_created_at_idx
  on plans (user_id, created_at desc);
create index if not exists plans_user_id_event_date_idx
  on plans (user_id, event_date);

alter table plans enable row level security;

create policy "plans_select_own" on plans
  for select using (auth.uid() = user_id);
create policy "plans_insert_own" on plans
  for insert with check (auth.uid() = user_id);
create policy "plans_delete_own" on plans
  for delete using (auth.uid() = user_id);

-- Migration: Google Calendar sync ("加入 Google 行事曆"). Same rules as
-- above — safe to re-run, safe on a fresh database.
create table if not exists google_calendar_tokens (
  user_id       uuid primary key references auth.users on delete cascade,
  refresh_token text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table google_calendar_tokens enable row level security;

create policy "google_calendar_tokens_select_own" on google_calendar_tokens
  for select using (auth.uid() = user_id);
create policy "google_calendar_tokens_insert_own" on google_calendar_tokens
  for insert with check (auth.uid() = user_id);
create policy "google_calendar_tokens_update_own" on google_calendar_tokens
  for update using (auth.uid() = user_id);
create policy "google_calendar_tokens_delete_own" on google_calendar_tokens
  for delete using (auth.uid() = user_id);

-- Which Google Calendar event (if any) a plan has been pushed to, so
-- "加入 Google 行事曆" can update instead of duplicate on a second click.
alter table plans add column if not exists google_event_id text;

-- After running this:
-- 1. Authentication -> Providers -> make sure "Email" is enabled.
-- 2. Authentication -> URL Configuration -> add your dev and prod origins
--    (e.g. http://localhost:3000 and https://your-app.vercel.app) to
--    "Redirect URLs" so the magic link can redirect back to /auth/callback.
-- 3. Settings -> API -> copy "Project URL" and the "anon public" key into
--    .env.local as NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.

-- Migration: Meeting Assistant ("會議助理"). Same rules as above — safe to
-- re-run, safe on a fresh database.
--
-- Manual step required first: create a PRIVATE Storage bucket named exactly
-- "meeting-audio" (Storage -> New bucket). On the free Supabase plan, 50MB
-- is a hard per-OBJECT cap the bucket's own size-limit setting can't
-- exceed — but audio_path is a folder, not a single file: recordings bigger
-- than that get split client-side into several parts under the cap (see
-- lib/meetings/chunkedUpload.ts) and reassembled back into the exact
-- original file in app/api/meetings/[meetingId]/process/route.ts before
-- Gemini ever sees it, so this cap doesn't actually limit recording length
-- in practice — MAX_MEETING_AUDIO_BYTES (lib/meetings/constants.ts) is a
-- much higher sanity ceiling instead, there mainly to bound how much a
-- Vercel function needs to hold in memory while reassembling.
create table if not exists meetings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  title        text not null,
  -- Path inside the "meeting-audio" bucket: "{userId}/{meetingId}.<ext>".
  audio_path   text not null,
  status       text not null default 'uploaded'
               check (status in ('uploaded', 'processing', 'done', 'failed')),
  error        text,
  -- Plain text (a bare JSON string in this jsonb column, not an array) — no
  -- speaker diarization; see lib/meetings/gemini.ts for why that was dropped.
  transcript   jsonb,
  summary      text,
  -- [{ "text": "...", "owner": string | null }, ...]
  action_items jsonb,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists meetings_user_id_created_at_idx
  on meetings (user_id, created_at desc);

alter table meetings enable row level security;

create policy "meetings_select_own" on meetings
  for select using (auth.uid() = user_id);
create policy "meetings_insert_own" on meetings
  for insert with check (auth.uid() = user_id);
create policy "meetings_update_own" on meetings
  for update using (auth.uid() = user_id);
create policy "meetings_delete_own" on meetings
  for delete using (auth.uid() = user_id);

-- Storage policies for the "meeting-audio" bucket (bucket itself must be
-- created via the dashboard first — SQL can't create buckets). Object paths
-- are "{userId}/{meetingId}.<ext>", so the first path segment is the owner.
create policy "meeting_audio_select_own" on storage.objects for select using (
  bucket_id = 'meeting-audio' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "meeting_audio_insert_own" on storage.objects for insert with check (
  bucket_id = 'meeting-audio' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "meeting_audio_delete_own" on storage.objects for delete using (
  bucket_id = 'meeting-audio' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Migration: segment-at-a-time meeting processing. Same rules — safe to
-- re-run, safe on a fresh database.
--
-- A single generateContent call producing a full-length transcript for a
-- long recording was reliably exceeding Vercel's 60s hard cap. Recordings
-- are now split client-side into time-based segments (lib/meetings/audioSplit.ts)
-- and transcribed one segment per request/response.ts invocation, each with
-- its own fresh 60s budget — the route re-triggers itself (a fetch to its
-- own URL) after finishing one segment/the final summarize step, so the
-- client only ever needs to fire the first request and then poll the row
-- like before. total_segments is set once, up front, from how many segments
-- the client actually uploaded; segments_done is how many of those have had
-- their transcript appended to the `transcript` column so far — comparing
-- the two is how the route knows whether there's another segment to
-- transcribe or whether it's time for the final (fast, text-only) summarize
-- pass. A recording that fits in one segment (the common case) still goes
-- through this same path with total_segments = 1 — no special-casing.
alter table meetings add column if not exists total_segments int not null default 1;
alter table meetings add column if not exists segments_done int not null default 0;

-- Migration: meeting chapters ("章節" — a topic-based outline, generated
-- alongside summary/actionItems/notes in the same fast text-only
-- summarize call, not a separate Gemini call). Same rules — safe to
-- re-run, safe on a fresh database.
-- [{ "title": "...", "description": "..." }, ...]
alter table meetings add column if not exists chapters jsonb;
