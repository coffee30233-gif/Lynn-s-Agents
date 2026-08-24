// Supabase's free-tier plan caps individual Storage uploads at 50MB — this
// is a platform limit, not something the bucket's own size-limit setting can
// override (confirmed while setting up the meeting-audio bucket, where the
// dashboard wouldn't accept a higher value at all). Shared by the file-picker
// upload form and the live-recording flow, both of which need to check this
// client-side before attempting a Storage upload.
export const MAX_MEETING_AUDIO_BYTES = 50 * 1024 * 1024;
