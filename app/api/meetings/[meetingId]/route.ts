import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMeeting, deleteMeeting, updateTranscript, type TranscriptSegment } from "@/lib/meetings/queries";

export async function GET(req: NextRequest, { params }: { params: { meetingId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meeting = await getMeeting(supabase, params.meetingId);
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ meeting });
}

/**
 * Renaming a speaker (e.g. "Speaker A" -> "Lynn" after reading the
 * transcript) is a client-side find-and-replace over the whole array —
 * the browser already has the full transcript loaded, so it just sends the
 * updated array back rather than this route doing string-replace on
 * Gemini's diarization output itself. Only transcript is editable this way;
 * summary/actionItems/notes stay as Gemini produced them.
 */
export async function PATCH(req: NextRequest, { params }: { params: { meetingId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meeting = await getMeeting(supabase, params.meetingId);
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { transcript?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const isValidSegment = (s: unknown): s is TranscriptSegment =>
    typeof s === "object" && s !== null && typeof (s as TranscriptSegment).speaker === "string" &&
    typeof (s as TranscriptSegment).text === "string";
  if (!Array.isArray(body.transcript) || !body.transcript.every(isValidSegment)) {
    return NextResponse.json({ error: "transcript must be an array of {speaker, text}" }, { status: 400 });
  }

  await updateTranscript(supabase, meeting.id, body.transcript);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { meetingId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meeting = await getMeeting(supabase, params.meetingId);
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // audio_path is a folder that may hold several chunked parts (see
  // lib/meetings/chunkedUpload.ts) — list it and remove every part rather
  // than assuming a single object at that exact path. Best-effort: an
  // orphaned Storage object is a much smaller problem than failing the
  // delete entirely because of it. (The Supabase client resolves with
  // { error } rather than throwing, so no try/catch needed here.)
  const { data: entries } = await supabase.storage.from("meeting-audio").list(meeting.audioPath);
  if (entries && entries.length > 0) {
    await supabase.storage.from("meeting-audio").remove(entries.map((e) => `${meeting.audioPath}/${e.name}`));
  }
  await deleteMeeting(supabase, params.meetingId);

  return NextResponse.json({ ok: true });
}
