import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMeeting, deleteMeeting } from "@/lib/meetings/queries";

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

  // Best-effort — an orphaned Storage object is a much smaller problem than
  // failing the delete entirely because of it. (The Supabase client resolves
  // with { error } rather than throwing, so no try/catch needed here.)
  await supabase.storage.from("meeting-audio").remove([meeting.audioPath]);
  await deleteMeeting(supabase, params.meetingId);

  return NextResponse.json({ ok: true });
}
