import type { SupabaseClient } from "@supabase/supabase-js";

export type MeetingStatus = "uploaded" | "processing" | "done" | "failed";

export interface ActionItem {
  text: string;
  owner: string | null;
}

export interface Meeting {
  id: string;
  title: string;
  audioPath: string;
  status: MeetingStatus;
  error: string | null;
  /** Plain text, no speaker attribution — see lib/meetings/gemini.ts for why
   * diarization was dropped. Segments are appended to this with a blank
   * line between them as each finishes (appendSegmentTranscript). */
  transcript: string | null;
  summary: string | null;
  actionItems: ActionItem[] | null;
  notes: string | null;
  /** How many audio segments this recording was split into client-side (see
   * lib/meetings/audioSplit.ts) — 1 for a recording short enough to not need
   * splitting, same code path either way. */
  totalSegments: number;
  /** How many of those segments have had their transcript appended to
   * `transcript` so far. segmentsDone === totalSegments means transcription
   * is complete and the next step is the final summarize pass. */
  segmentsDone: number;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: {
  id: string;
  title: string;
  audio_path: string;
  status: MeetingStatus;
  error: string | null;
  transcript: string | null;
  summary: string | null;
  action_items: ActionItem[] | null;
  notes: string | null;
  total_segments: number;
  segments_done: number;
  created_at: string;
  updated_at: string;
}): Meeting {
  return {
    id: row.id,
    title: row.title,
    audioPath: row.audio_path,
    status: row.status,
    error: row.error,
    transcript: row.transcript,
    summary: row.summary,
    actionItems: row.action_items,
    notes: row.notes,
    totalSegments: row.total_segments,
    segmentsDone: row.segments_done,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MEETING_COLUMNS =
  "id, title, audio_path, status, error, transcript, summary, action_items, notes, total_segments, segments_done, created_at, updated_at";

/**
 * Takes an explicit id (the caller generates it with crypto.randomUUID(),
 * same global already used for conversationId in app/api/chat/route.ts)
 * instead of letting the table's default generate one — the route handler
 * needs the id up front to compute audio_path ("{userId}/{id}", a Storage
 * folder the client uploads one subfolder per audio segment into — see
 * lib/meetings/audioSplit.ts and chunkedUpload.ts) in the same request that
 * creates the row, rather than inserting a placeholder path and updating it
 * once the client's Storage upload finishes.
 *
 * totalSegments is known client-side before any upload happens (splitting
 * is done first, entirely in the browser), so it's set here at creation
 * time rather than patched in later.
 */
export async function createMeeting(
  supabase: SupabaseClient,
  userId: string,
  input: { id: string; title: string; audioPath: string; totalSegments: number }
): Promise<string> {
  const { data, error } = await supabase
    .from("meetings")
    .insert({
      id: input.id,
      user_id: userId,
      title: input.title,
      audio_path: input.audioPath,
      total_segments: input.totalSegments,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to create meeting: ${error?.message}`);
  return data.id;
}

export async function listMeetingsForUser(supabase: SupabaseClient): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from("meetings")
    .select(MEETING_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list meetings: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export async function getMeeting(supabase: SupabaseClient, meetingId: string): Promise<Meeting | null> {
  const { data } = await supabase.from("meetings").select(MEETING_COLUMNS).eq("id", meetingId).single();
  return data ? mapRow(data) : null;
}

export async function markProcessing(supabase: SupabaseClient, meetingId: string): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({ status: "processing", error: null, updated_at: new Date().toISOString() })
    .eq("id", meetingId);
  if (error) throw new Error(`Failed to mark meeting processing: ${error.message}`);
}

/**
 * Appends one segment's transcript text to whatever's already accumulated
 * and bumps segments_done — a plain read-modify-write (no concurrent
 * writers are possible for one meeting: the pipeline is strictly
 * self-chained one step at a time, see process/route.ts) rather than an
 * atomic concat, since there's no RPC/raw-SQL infrastructure in this
 * codebase to do that in one round trip.
 */
export async function appendSegmentTranscript(
  supabase: SupabaseClient,
  meetingId: string,
  segmentText: string
): Promise<void> {
  const meeting = await getMeeting(supabase, meetingId);
  if (!meeting) throw new Error("Meeting not found");

  const { error } = await supabase
    .from("meetings")
    .update({
      transcript: meeting.transcript ? `${meeting.transcript}\n\n${segmentText}` : segmentText,
      segments_done: meeting.segmentsDone + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", meetingId);
  if (error) throw new Error(`Failed to append segment transcript: ${error.message}`);
}

/** Final step of the pipeline, once segmentsDone === totalSegments — writes
 * the summarizeTranscript() result. Doesn't touch `transcript` itself,
 * which was already fully assembled by appendSegmentTranscript. */
export async function markDone(
  supabase: SupabaseClient,
  meetingId: string,
  summary: { summary: string; actionItems: ActionItem[]; notes: string }
): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({
      status: "done",
      summary: summary.summary,
      action_items: summary.actionItems,
      notes: summary.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", meetingId);
  if (error) throw new Error(`Failed to mark meeting done: ${error.message}`);
}

export async function markFailed(supabase: SupabaseClient, meetingId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
    .eq("id", meetingId);
  if (error) throw new Error(`Failed to mark meeting failed: ${error.message}`);
}

export async function deleteMeeting(supabase: SupabaseClient, meetingId: string): Promise<void> {
  const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
  if (error) throw new Error(`Failed to delete meeting: ${error.message}`);
}
