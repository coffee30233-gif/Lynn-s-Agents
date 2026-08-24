import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMeeting, markProcessing, markDone, markFailed } from "@/lib/meetings/queries";
import { generateMeetingReport } from "@/lib/meetings/gemini";

// Vercel Hobby's hard cap — can't be raised past this regardless of what's
// declared here. The pipeline (Storage download -> Gemini file upload ->
// wait for ACTIVE -> generateContent) has to fit inside it; there's no way
// to resume a killed request, so a mid-flight kill just leaves the row
// stuck at "processing" (see MeetingStatusPoller's stuck-detection retry).
export const maxDuration = 60;

const EXT_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  ogg: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
  "3gp": "audio/3gpp",
  amr: "audio/amr",
};

function mimeTypeFor(audioPath: string): string {
  const ext = audioPath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "audio/mpeg";
}

export async function POST(req: NextRequest, { params }: { params: { meetingId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meeting = await getMeeting(supabase, params.meetingId);
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Mark processing before any slow work — if this whole request gets
  // killed by Vercel's timeout further down, the row is at least left in a
  // reasoned-about state ("processing", not "uploaded") instead of looking
  // like nothing ever happened.
  await markProcessing(supabase, meeting.id);

  try {
    console.log(`[meetings] ${meeting.id}: downloading from storage`);
    const { data: audioBlob, error: downloadError } = await supabase.storage
      .from("meeting-audio")
      .download(meeting.audioPath);
    if (downloadError || !audioBlob) {
      throw new Error(`Failed to download audio: ${downloadError?.message ?? "no data"}`);
    }

    console.log(`[meetings] ${meeting.id}: calling Gemini`);
    const report = await generateMeetingReport(audioBlob, mimeTypeFor(meeting.audioPath), meeting.title);

    await markDone(supabase, meeting.id, report);
    console.log(`[meetings] ${meeting.id}: done`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meetings] ${meeting.id}: failed —`, message);
    await markFailed(supabase, meeting.id, message);
  }

  // The client fires this request and doesn't wait on its body — the
  // meetings row (polled separately) is the actual source of truth.
  return NextResponse.json({ ok: true });
}
