import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { TripGenerationError } from "./gemini";

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

type AuthResult =
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; response: NextResponse };

/** For routes that read/write the trips table — Supabase is required. */
export async function requireUser(): Promise<AuthResult> {
  if (!supabaseConfigured()) {
    return { ok: false, response: NextResponse.json({ error: "旅行規劃需要先設定 Supabase" }, { status: 501 }) };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "請先登入" }, { status: 401 }) };
  return { ok: true, supabase, userId: user.id };
}

/** For the two generation routes, which never touch the database: same
 * local-dev convenience as app/api/chat/route.ts — with Supabase configured
 * (always true in production) they require a login, without it they just
 * run, so the feature can be tried locally before Supabase is set up. */
export async function requireUserIfConfigured(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!supabaseConfigured()) return { ok: true };
  const auth = await requireUser();
  return auth.ok ? { ok: true } : auth;
}

export function tripErrorResponse(err: unknown): NextResponse {
  if (err instanceof TripGenerationError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[trips] unexpected error:", err);
  return NextResponse.json({ error: "發生未知錯誤，請再試一次" }, { status: 500 });
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
