import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deletePlan, getPlan } from "@/lib/plans/queries";
import { removePlanFromGoogleCalendar } from "@/lib/plans/googleSync";

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
