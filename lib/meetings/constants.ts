// Supabase's free-tier plan caps individual Storage objects at 50MB. Rather
// than reject anything bigger, uploads are split into parts safely under
// that cap (see chunkedUpload.ts) and reassembled server-side before ever
// reaching Gemini — so the real ceiling here isn't Storage's per-object cap
// anymore, it's how much a Vercel function can comfortably hold in memory
// while downloading all the parts back and reassembling them (process/route.ts
// needs roughly 2x the file size in memory transiently: the reassembled
// Blob plus what's being uploaded to Gemini's Files API). 400MB is a
// generous sanity ceiling — a multi-hour meeting at a reasonable voice
// bitrate should land well under it — not a hard technical limit.
export const MAX_MEETING_AUDIO_BYTES = 400 * 1024 * 1024;

// Shared between lib/meetings/audioSplit.ts (client-side, does the actual
// splitting) and app/api/meetings/[meetingId]/process/route.ts (server-side,
// needs it to compute each segment's absolute start time for timestamped
// transcript lines — see lib/meetings/gemini.ts). Started at 10 minutes;
// that was still occasionally exceeding Vercel's 60s cap in practice
// (per-call time doesn't scale perfectly predictably — some segments
// legitimately take longer to transcribe than others), so this is more
// conservative. Smaller segments mean more total Gemini calls for the same
// recording, but each one is safer.
export const SEGMENT_SECONDS = 5 * 60;
