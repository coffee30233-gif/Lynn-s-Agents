import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMeeting, listMeetingsForUser } from "@/lib/meetings/queries";

const ALLOWED_EXTS = ["mp3", "m4a", "wav", "aac", "ogg", "webm", "flac", "3gp", "amr"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meetings = await listMeetingsForUser(supabase);
  return NextResponse.json({ meetings });
}

export async function POST(req: NextRequest) {
  let body: { title?: string; fileExt?: string; totalSegments?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = body.title?.trim();
  const fileExt = body.fileExt?.trim().toLowerCase().replace(/^\./, "");
  const totalSegments = body.totalSegments ?? 1;
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!fileExt || !ALLOWED_EXTS.includes(fileExt)) {
    return NextResponse.json({ error: `fileExt must be one of: ${ALLOWED_EXTS.join(", ")}` }, { status: 400 });
  }
  if (!Number.isInteger(totalSegments) || totalSegments < 1) {
    return NextResponse.json({ error: "totalSegments must be a positive integer" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = crypto.randomUUID();
  // A folder, not a file. Client-side splitting (lib/meetings/audioSplit.ts)
  // produces one WAV per ~10-minute segment — each is uploaded under its own
  // "segment-0000/", "segment-0001/", ... subfolder here, and each of those
  // may itself hold several chunked parts (lib/meetings/chunkedUpload.ts) if
  // that segment alone is bigger than Supabase's per-object Storage cap
  // (unlikely at 16kHz mono, but the mechanism is there regardless).
  // process/route.ts lists and reassembles whatever's under each segment
  // folder, one segment per invocation.
  const audioPath = `${user.id}/${id}`;
  await createMeeting(supabase, user.id, { id, title, audioPath, totalSegments });

  return NextResponse.json({ id, audioPath });
}
