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
  let body: { title?: string; fileExt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = body.title?.trim();
  const fileExt = body.fileExt?.trim().toLowerCase().replace(/^\./, "");
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!fileExt || !ALLOWED_EXTS.includes(fileExt)) {
    return NextResponse.json({ error: `fileExt must be one of: ${ALLOWED_EXTS.join(", ")}` }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = crypto.randomUUID();
  // A folder, not a file — the client may upload this as several chunked
  // parts under it (see lib/meetings/chunkedUpload.ts) if the recording is
  // bigger than Supabase's per-object Storage cap. process/route.ts lists
  // and reassembles whatever's in here regardless of part count.
  const audioPath = `${user.id}/${id}`;
  await createMeeting(supabase, user.id, { id, title, audioPath });

  return NextResponse.json({ id, audioPath });
}
