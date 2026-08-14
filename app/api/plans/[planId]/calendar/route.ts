import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlan, setGoogleEventId, getGoogleRefreshToken } from "@/lib/plans/queries";
import { upsertCalendarEvent } from "@/lib/google/calendar";
import { stripMarkdown } from "@/lib/text/stripMarkdown";

export async function POST(req: NextRequest, { params }: { params: { planId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getPlan(supabase, params.planId);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!plan.eventDate) {
    return NextResponse.json({ error: "此行程沒有日期，請先補上日期再加入行事曆" }, { status: 400 });
  }

  const refreshToken = await getGoogleRefreshToken(supabase, user.id);
  if (!refreshToken) {
    return NextResponse.json({ error: "尚未連接 Google 行事曆" }, { status: 400 });
  }

  try {
    const eventId = await upsertCalendarEvent(refreshToken, plan.googleEventId, {
      title: plan.title,
      location: plan.location,
      date: plan.eventDate,
      description: stripMarkdown(plan.content).slice(0, 1000),
    });
    await setGoogleEventId(supabase, plan.id, eventId);
    return NextResponse.json({ eventId });
  } catch (err) {
    console.error("[google-calendar] event sync failed:", err);
    return NextResponse.json({ error: "同步失敗，請再試一次" }, { status: 500 });
  }
}
