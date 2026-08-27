import type { SupabaseClient } from "@supabase/supabase-js";

// Comfortably under Supabase's 50MB free-tier per-object cap.
const CHUNK_SIZE = 45 * 1024 * 1024;

/**
 * Splits a file into parts under Supabase's per-object Storage cap and
 * uploads each to "{audioPathPrefix}/part-0000.<ext>", "part-0001.<ext>", etc.
 * This is a pure byte-level split (Blob.slice), not audio-aware — the parts
 * aren't independently playable, but that's fine because nothing ever
 * plays them back separately: app/api/meetings/[meetingId]/process/route.ts
 * downloads and concatenates them back into the exact original file before
 * handing it to Gemini, so there's no audio-chunk-boundary effect on the
 * analysis at all (in particular, no speaker-label continuity issue the way
 * actually splitting the audio itself for separate Gemini calls would have).
 *
 * A file already under CHUNK_SIZE just becomes a single "part-0000" — the
 * server side always lists-and-reassembles regardless of part count, so
 * there's no special case to keep in sync between the two ends.
 */
export async function uploadMeetingAudioChunked(
  supabase: SupabaseClient,
  audioPathPrefix: string,
  fileExt: string,
  file: Blob,
  contentType?: string
): Promise<void> {
  const totalParts = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  for (let i = 0; i < totalParts; i++) {
    const start = i * CHUNK_SIZE;
    const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
    const partPath = `${audioPathPrefix}/part-${String(i).padStart(4, "0")}.${fileExt}`;
    const { error } = await supabase.storage.from("meeting-audio").upload(partPath, chunk, { contentType });
    if (error) throw new Error(`上傳第 ${i + 1}/${totalParts} 段失敗：${error.message}`);
  }
}
