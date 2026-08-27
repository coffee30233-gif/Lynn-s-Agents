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
