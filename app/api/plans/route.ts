import { NextRequest, NextResponse } from "next/server";
import type { Source } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { createPlan, getPlan } from "@/lib/plans/queries";
import { syncPlanToGoogleCalendar } from "@/lib/plans/googleSync";

export async function POST(req: NextRequest) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseConfigured) {
    return NextResponse.json({ error: "Plans require Supabase to be configured" }, { status: 501 });
  }

  let body: {
    title?: string;
    location?: string;
    eventDate?: string;
    content?: string;
    sources?: Source[];
    conversationId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = body.title?.trim();
  const content = body.content?.trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = await createPlan(supabase, user.id, {
    title,
    location: body.location?.trim(),
    eventDate: body.eventDate?.trim(),
    content,
    sources: body.sources,
    sourceConversationId: body.conversationId,
  });

  const plan = await getPlan(supabase, id);
  if (plan) await syncPlanToGoogleCalendar(supabase, user.id, plan);

  return NextResponse.json({ id });
}
