import { NextRequest, NextResponse } from "next/server";
import type { AgentMode, CouncilRequestBody, CouncilResponse, CouncilResponseBody } from "@/types";
import { getCharacterById } from "@/lib/characters/registry";
import { loadSkill } from "@/lib/characters/loader";
import { buildSystemPrompt } from "@/lib/agent/promptBuilder";
import { buildSynthesisPrompt } from "@/lib/agent/synthesis";
import { getCharacterReply } from "@/lib/agent/reply";
import { createClient } from "@/lib/supabase/server";
import { appendMessage, createConversation } from "@/lib/conversations/queries";
import { getUserMemories } from "@/lib/memory/queries";

// Panelists run in parallel but the synthesis call is sequential after them,
// and Vercel's default (10s on Hobby) is nowhere near enough for that chain.
export const maxDuration = 60;

const MODE: AgentMode = "chat";

export async function POST(req: NextRequest) {
  let body: CouncilRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { characterIds, message } = body;

  if (!Array.isArray(characterIds) || characterIds.length < 2) {
    return NextResponse.json({ error: "At least 2 characterIds are required" }, { status: 400 });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const characters = characterIds.map((id) => getCharacterById(id));
  const missing = characterIds.filter((_, i) => !characters[i]);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Unknown character(s): ${missing.join(", ")}` }, { status: 404 });
  }
  const panel = characters.filter((c): c is NonNullable<(typeof characters)[number]> => c !== null);

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const supabase = supabaseConfigured ? await createClient() : null;
  let conversationId: string | undefined;
  let memories: string[] = [];

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    conversationId = await createConversation(supabase, user.id, {
      councilCharacterIds: characterIds,
      mode: MODE,
    });
    await appendMessage(supabase, conversationId, "user", message);
    memories = await getUserMemories(supabase, { excludeConversationId: conversationId });
  }

  const individual = await Promise.all(
    panel.map(async (character) => {
      const skill = loadSkill(character);
      const systemPrompt = buildSystemPrompt(character, skill, MODE, character.memory.enabled ? memories : []);
      // Unlike /api/chat, this call isn't the only thing in the 60s budget —
      // synthesis still runs after every panelist returns — so it gets a
      // smaller slice (30s) rather than the client's 55s default, leaving
      // room for synthesis's own call below.
      const result = await getCharacterReply(
        character.id,
        systemPrompt,
        [{ role: "user", content: message }],
        conversationId,
        MODE,
        30000
      );
      return { character, result };
    })
  );

  const failure = individual.find((r) => !r.result.ok);
  if (failure && !failure.result.ok) {
    return NextResponse.json({ error: failure.result.error }, { status: failure.result.status });
  }

  const responses: CouncilResponse[] = individual.map((r) => ({
    characterId: r.character.id,
    displayName: r.character.displayName,
    message: r.result.ok ? r.result.message : "",
    sources: r.result.ok ? r.result.sources : [],
  }));

  if (supabase && conversationId) {
    await Promise.all(
      responses.map((r) =>
        appendMessage(supabase, conversationId!, "assistant", r.message, r.characterId, r.sources)
      )
    );
  }

  // Runs after the panel stage above, in the same 60s budget — 25s here
  // plus the panel's 30s leaves ~5s for the rest of the route handler.
  const synthesisPrompt = buildSynthesisPrompt(message, responses);
  const synthesisResult = await getCharacterReply(
    "synthesis",
    synthesisPrompt,
    [{ role: "user", content: "Please give your synthesis now." }],
    conversationId,
    MODE,
    25000
  );

  if (!synthesisResult.ok) {
    return NextResponse.json({ error: synthesisResult.error }, { status: synthesisResult.status });
  }

  if (supabase && conversationId) {
    await appendMessage(supabase, conversationId, "assistant", synthesisResult.message, "synthesis");
  }

  const response: CouncilResponseBody = {
    conversationId: conversationId ?? crypto.randomUUID(),
    responses,
    synthesis: synthesisResult.message,
  };
  return NextResponse.json(response);
}
