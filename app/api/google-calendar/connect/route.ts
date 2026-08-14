import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/google/calendar";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/google-calendar/callback", req.url).toString();
  const authUrl = buildAuthUrl(redirectUri, state);

  const res = NextResponse.redirect(authUrl);
  // Verified against the "state" Google echoes back on /callback — cheap CSRF
  // guard so a forged callback request can't attach a token to this session.
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
