import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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

function mimeTypeForFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "audio/mpeg";
}

/**
 * audio_path is a Storage folder, not a file — the client may have split a
 * large recording into several "part-0000.<ext>", "part-0001.<ext>", ...
 * chunks (see lib/meetings/chunkedUpload.ts) purely to get under Supabase's
 * per-object size cap. Lists whatever's in there, downloads every part, and
 * concatenates them back into the exact original file before Gemini ever
 * sees it — a pure byte-level rejoin, so this has no effect on the analysis
 * itself (no chunk boundaries, no speaker-label continuity issue). Works
 * identically whether there's 1 part or many.
 */
async function downloadAndReassembleAudio(
  supabase: SupabaseClient,
  audioPath: string
): Promise<{ blob: Blob; mimeType: string }> {
  const { data: entries, error: listError } = await supabase.storage.from("meeting-audio").list(audioPath);
  if (listError) throw new Error(`Failed to list audio parts: ${listError.message}`);
  const parts = (entries ?? []).filter((e) => e.name.startsWith("part-")).sort((a, b) => a.name.localeCompare(b.name));
  if (parts.length === 0) throw new Error("No audio parts found in storage");

  const downloaded = await Promise.all(
    parts.map(async (part) => {
      const { data, error } = await supabase.storage.from("meeting-audio").download(`${audioPath}/${part.name}`);
      if (error || !data) throw new Error(`Failed to download ${part.name}: ${error?.message ?? "no data"}`);
      return data;
    })
  );

  return { blob: new Blob(downloaded), mimeType: mimeTypeForFilename(parts[0]!.name) };
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

  // Mark processing before any slow work — if this whole request gets
  // killed by Vercel's timeout further down, the row is at least left in a
  // reasoned-about state ("processing", not "uploaded") instead of looking
  // like nothing ever happened.
  await markProcessing(supabase, meeting.id);

  try {
    console.log(`[meetings] ${meeting.id}: downloading from storage`);
    const { blob: audioBlob, mimeType } = await downloadAndReassembleAudio(supabase, meeting.audioPath);

    console.log(`[meetings] ${meeting.id}: calling Gemini`);
    const report = await generateMeetingReport(audioBlob, mimeType, meeting.title, deadline);

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
