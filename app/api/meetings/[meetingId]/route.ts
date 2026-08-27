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

  // audio_path is two levels deep: one "segment-NNNN" subfolder per audio
  // segment (lib/meetings/audioSplit.ts), each possibly holding several
  // chunked "part-NNNN" files (lib/meetings/chunkedUpload.ts). list() only
  // returns one level at a time, so list the segment subfolders first, then
  // list and collect every part inside each before removing anything.
  // Best-effort: an orphaned Storage object is a much smaller problem than
  // failing the delete entirely because of it. (The Supabase client
  // resolves with { error } rather than throwing, so no try/catch needed.)
  const { data: segmentFolders } = await supabase.storage.from("meeting-audio").list(meeting.audioPath);
  if (segmentFolders && segmentFolders.length > 0) {
    const allObjectPaths = (
      await Promise.all(
        segmentFolders.map(async (folder) => {
          const segmentPath = `${meeting.audioPath}/${folder.name}`;
          const { data: parts } = await supabase.storage.from("meeting-audio").list(segmentPath);
          return (parts ?? []).map((part) => `${segmentPath}/${part.name}`);
        })
      )
    ).flat();
    if (allObjectPaths.length > 0) {
      await supabase.storage.from("meeting-audio").remove(allObjectPaths);
    }
  }
  await deleteMeeting(supabase, params.meetingId);

  return NextResponse.json({ ok: true });
}
