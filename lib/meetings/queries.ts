import type { SupabaseClient } from "@supabase/supabase-js";

export type MeetingStatus = "uploaded" | "processing" | "done" | "failed";

export interface TranscriptSegment {
  speaker: string;
  text: string;
}

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
  transcript: TranscriptSegment[] | null;
  summary: string | null;
  actionItems: ActionItem[] | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: {
  id: string;
  title: string;
  audio_path: string;
  status: MeetingStatus;
  error: string | null;
  transcript: TranscriptSegment[] | null;
  summary: string | null;
  action_items: ActionItem[] | null;
  notes: string | null;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MEETING_COLUMNS =
  "id, title, audio_path, status, error, transcript, summary, action_items, notes, created_at, updated_at";

/**
 * Takes an explicit id (the caller generates it with crypto.randomUUID(),
 * same global already used for conversationId in app/api/chat/route.ts)
 * instead of letting the table's default generate one — the route handler
 * needs the id up front to compute audio_path ("{userId}/{id}", a Storage
 * folder the client uploads one or more chunked parts into — see
 * lib/meetings/chunkedUpload.ts) in the same request that creates the row,
 * rather than inserting a placeholder path and updating it once the
 * client's Storage upload finishes.
 */
export async function createMeeting(
  supabase: SupabaseClient,
  userId: string,
  input: { id: string; title: string; audioPath: string }
): Promise<string> {
  const { data, error } = await supabase
    .from("meetings")
    .insert({ id: input.id, user_id: userId, title: input.title, audio_path: input.audioPath })
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

export async function markDone(
  supabase: SupabaseClient,
  meetingId: string,
  report: { transcript: TranscriptSegment[]; summary: string; actionItems: ActionItem[]; notes: string }
): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({
      status: "done",
      transcript: report.transcript,
      summary: report.summary,
      action_items: report.actionItems,
      notes: report.notes,
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

export async function updateTranscript(
  supabase: SupabaseClient,
  meetingId: string,
  transcript: TranscriptSegment[]
): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({ transcript, updated_at: new Date().toISOString() })
    .eq("id", meetingId);
  if (error) throw new Error(`Failed to update transcript: ${error.message}`);
}

export async function deleteMeeting(supabase: SupabaseClient, meetingId: string): Promise<void> {
  const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
  if (error) throw new Error(`Failed to delete meeting: ${error.message}`);
}
