import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLiveSessionToken } from "@/lib/voice/liveToken";
import { getCharacterById } from "@/lib/characters/registry";
import { loadSkill } from "@/lib/characters/loader";
import { buildSystemPrompt } from "@/lib/agent/promptBuilder";
import { getUserMemories } from "@/lib/memory/queries";

/**
 * POST /api/live/token
 *
 * Mints a short-lived ephemeral token before the browser opens a Live API
 * WebSocket connection directly to Gemini — this endpoint never touches the
 * audio itself, it just hands out a credential (see lib/voice/liveToken.ts).
 *
 * Also builds and returns the system instruction, reusing the same
 * buildSystemPrompt() every text character uses — the character's SKILL.md
 * stays the single source of truth for persona/behavior instead of
 * duplicating correction-style rules here.
 *
 * Requires login so the GEMINI_API_KEY quota isn't callable by anyone.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  let body: { characterId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const character = getCharacterById(body.characterId ?? "");
  if (!character) {
    return NextResponse.json({ error: `Unknown character "${body.characterId}"` }, { status: 404 });
  }

  try {
    const [session, memories] = await Promise.all([
      createLiveSessionToken(),
      character.memory.enabled ? getUserMemories(supabase) : Promise.resolve([]),
    ]);

    const skill = loadSkill(character);
    const systemInstruction = buildSystemPrompt(character, skill, "chat", memories);

    return NextResponse.json({ ...session, systemInstruction });
  } catch (err) {
    console.error("[live/token] failed:", err);
    return NextResponse.json({ error: "無法建立即時語音連線憑證" }, { status: 502 });
  }
}
