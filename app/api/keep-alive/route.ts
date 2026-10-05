import { NextRequest, NextResponse } from "next/server";

// Supabase's free plan pauses a project after about a week with no activity,
// which is exactly what happens to a personal app that goes unused for a
// while. vercel.json schedules a daily call to this route (Vercel Hobby
// allows one cron run per day, which is plenty against a 7-day threshold),
// and this makes one tiny real query against Postgres so the project counts
// as active.
//
// Plain fetch against the REST API with the public anon key instead of the
// SSR client: there's no logged-in user in a cron request, and the query
// doesn't need to return anything — RLS on `plans` just means anon gets back
// an empty array, but it's still a genuine round trip to the database.
//
// If CRON_SECRET is set in the Vercel project, Vercel automatically sends it
// as "Authorization: Bearer <secret>" on cron invocations, and this route
// then rejects anything without it. Unset, the route stays open — it only
// ever returns { ok: true }, so there's nothing to leak, but setting the
// secret stops strangers from using it to poke the database.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${url}/rest/v1/plans?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[keep-alive] Supabase responded ${res.status}`);
      return NextResponse.json({ error: `Supabase responded ${res.status}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[keep-alive] request failed:", err);
    return NextResponse.json({ error: "Supabase unreachable" }, { status: 502 });
  }
}
