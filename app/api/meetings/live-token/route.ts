import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMeetingLiveToken } from "@/lib/meetings/liveToken";

/**
 * POST /api/meetings/live-token
 *
 * Same idea as /api/live/token (mints a short-lived credential so the
 * browser can open a Live API WebSocket directly to Gemini without ever
 * holding GEMINI_API_KEY) — no character/skill involved here, the meeting
 * listener's system instruction is fixed (see lib/meetings/liveToken.ts).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  try {
    const session = await createMeetingLiveToken();
    return NextResponse.json(session);
  } catch (err) {
    console.error("[meetings/live-token] failed:", err);
    return NextResponse.json({ error: "無法建立即時連線憑證" }, { status: 502 });
  }
}
