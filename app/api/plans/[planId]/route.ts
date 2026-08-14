import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deletePlan, getPlan, updatePlan, clearGoogleEventId } from "@/lib/plans/queries";
import { removePlanFromGoogleCalendar, syncPlanToGoogleCalendar } from "@/lib/plans/googleSync";

export async function DELETE(req: NextRequest, { params }: { params: { planId: string } }) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseConfigured) {
    return NextResponse.json({ error: "Plans require Supabase to be configured" }, { status: 501 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plan = await getPlan(supabase, params.planId);
  if (plan) await removePlanFromGoogleCalendar(supabase, user.id, plan);

  await deletePlan(supabase, params.planId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { planId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string; location?: string; eventDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const existing = await getPlan(supabase, params.planId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newEventDate = body.eventDate?.trim() || null;

  await updatePlan(supabase, params.planId, {
    title,
    location: body.location?.trim() || null,
    eventDate: newEventDate,
  });

  // Date was cleared: the plan can't stay on the calendar with no date, so
  // drop its event instead of leaving a stale one behind.
  if (!newEventDate && existing.googleEventId) {
    await removePlanFromGoogleCalendar(supabase, user.id, existing);
    await clearGoogleEventId(supabase, params.planId);
  } else if (newEventDate) {
    const updated = await getPlan(supabase, params.planId);
    if (updated) await syncPlanToGoogleCalendar(supabase, user.id, updated);
  }

  return NextResponse.json({ ok: true });
}
