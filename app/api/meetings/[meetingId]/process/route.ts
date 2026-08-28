import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getMeeting, markProcessing, markDone, markFailed, appendSegmentTranscript } from "@/lib/meetings/queries";
import { transcribeAudioSegment, summarizeTranscript } from "@/lib/meetings/gemini";
import { segmentFolderName } from "@/lib/meetings/segmentPath";

// Vercel Hobby's hard cap — can't be raised past this regardless of what's
// declared here. A single call transcribing a whole 1+ hour recording was
// reliably exceeding it; this route now does ONE unit of work per
// invocation — transcribe one ~10-minute segment, or (once every segment is
// done) run the final text-only summarize pass — and re-triggers itself for
// the next unit before returning (see triggerNextStep below), so the
// pipeline as a whole isn't bound by this cap even though each individual
// piece is. There's still no way to resume a killed request mid-unit, so a
// mid-flight kill leaves the row stuck at "processing" (see
// MeetingStatusPoller's stuck-detection retry) — but "重試" now only has to
// re-do the one unit that was in flight, not the whole recording, since
// segmentsDone already reflects everything completed before that.
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

function mimeTypeForFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "audio/mpeg";
}

/**
 * A segment's own Storage folder ("{audioPath}/segment-0000") may itself
 * hold several chunked parts (lib/meetings/chunkedUpload.ts) if that one
 * segment alone were bigger than Supabase's per-object cap — unlikely at
 * 16kHz mono for a ~10 minute segment, but the mechanism is there
 * regardless. Lists whatever's in there, downloads every part, and
 * concatenates them back into that segment's exact original file before
 * Gemini ever sees it — a pure byte-level rejoin, no effect on the analysis.
 */
async function downloadAndReassembleAudio(
  supabase: SupabaseClient,
  folderPath: string
): Promise<{ blob: Blob; mimeType: string }> {
  const { data: entries, error: listError } = await supabase.storage.from("meeting-audio").list(folderPath);
  if (listError) throw new Error(`Failed to list audio parts: ${listError.message}`);
  const parts = (entries ?? []).filter((e) => e.name.startsWith("part-")).sort((a, b) => a.name.localeCompare(b.name));
  if (parts.length === 0) throw new Error(`No audio parts found in storage at ${folderPath}`);

  const downloaded = await Promise.all(
    parts.map(async (part) => {
      const { data, error } = await supabase.storage.from("meeting-audio").download(`${folderPath}/${part.name}`);
      if (error || !data) throw new Error(`Failed to download ${part.name}: ${error?.message ?? "no data"}`);
      return data;
    })
  );

  return { blob: new Blob(downloaded), mimeType: mimeTypeForFilename(parts[0]!.name) };
}

/** Fire-and-forget POST to this same route — starts the next unit of work
 * (the next segment, or the final summarize pass) in a fresh invocation
 * with a fresh 60s budget. Forwards the incoming request's cookies so the
 * self-call passes the same auth.getUser() check. */
function triggerNextStep(req: NextRequest) {
  fetch(req.url, { method: "POST", headers: { cookie: req.headers.get("cookie") ?? "" } }).catch((err) => {
    console.error("[meetings] failed to trigger next processing step:", err);
  });
}

export async function POST(req: NextRequest, { params }: { params: { meetingId: string } }) {
  // 5s safety margin under Vercel's 60s hard cap — used to decide whether a
  // transient-Gemini-error retry has any real chance of finishing before
  // this whole invocation gets killed (see generateContentWithRetry).
  const deadline = Date.now() + 55_000;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meeting = await getMeeting(supabase, params.meetingId);
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Mark processing before any slow work — if this invocation gets killed
  // by Vercel's timeout further down, the row is at least left in a
  // reasoned-about state ("processing", not "uploaded") instead of looking
  // like nothing ever happened.
  await markProcessing(supabase, meeting.id);

  try {
    if (meeting.segmentsDone < meeting.totalSegments) {
      const segmentIndex = meeting.segmentsDone;
      console.log(`[meetings] ${meeting.id}: transcribing segment ${segmentIndex + 1}/${meeting.totalSegments}`);

      const folderPath = `${meeting.audioPath}/${segmentFolderName(segmentIndex)}`;
      const { blob, mimeType } = await downloadAndReassembleAudio(supabase, folderPath);
      const segmentText = await transcribeAudioSegment(blob, mimeType, meeting.title, deadline);

      await appendSegmentTranscript(supabase, meeting.id, segmentText);
      console.log(`[meetings] ${meeting.id}: segment ${segmentIndex + 1}/${meeting.totalSegments} done`);
      triggerNextStep(req);
    } else {
      console.log(`[meetings] ${meeting.id}: all segments transcribed, summarizing`);
      const summary = await summarizeTranscript(meeting.transcript ?? "", deadline);
      await markDone(supabase, meeting.id, summary);
      console.log(`[meetings] ${meeting.id}: done`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meetings] ${meeting.id}: failed —`, message);
    await markFailed(supabase, meeting.id, message);
  }

  // The client fires this request and doesn't wait on its body — the
  // meetings row (polled separately) is the actual source of truth.
  return NextResponse.json({ ok: true });
}
