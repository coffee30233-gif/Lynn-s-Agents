import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForRefreshToken } from "@/lib/google/calendar";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get("google_oauth_state")?.value;

  const plansUrl = new URL("/plans", req.url);

  if (!code || !state || !expectedState || state !== expectedState) {
    plansUrl.searchParams.set("calendar_error", "1");
    return NextResponse.redirect(plansUrl);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const redirectUri = new URL("/api/google-calendar/callback", req.url).toString();

  try {
    const refreshToken = await exchangeCodeForRefreshToken(code, redirectUri);
    const { error } = await supabase.from("google_calendar_tokens").upsert({
      user_id: user.id,
      refresh_token: refreshToken,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[google-calendar] callback failed:", err);
    plansUrl.searchParams.set("calendar_error", "1");
    return NextResponse.redirect(plansUrl);
  }

  plansUrl.searchParams.set("calendar_connected", "1");
  const res = NextResponse.redirect(plansUrl);
  res.cookies.delete("google_oauth_state");
  return res;
}
