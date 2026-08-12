import { NextRequest, NextResponse } from "next/server";
import type { AgentMode, CouncilRequestBody, CouncilResponse, CouncilResponseBody } from "@/types";
import { getCharacterById } from "@/lib/characters/registry";
import { loadSkill } from "@/lib/characters/loader";
import { buildSystemPrompt } from "@/lib/agent/promptBuilder";
import { buildSynthesisPrompt } from "@/lib/agent/synthesis";
import { getCharacterReply } from "@/lib/agent/reply";
import { createClient } from "@/lib/supabase/server";
import { appendMessage, createConversation } from "@/lib/conversations/queries";

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
  }

  const individual = await Promise.all(
    panel.map(async (character) => {
      const skill = loadSkill(character);
      const systemPrompt = buildSystemPrompt(character, skill, MODE);
      const result = await getCharacterReply(character.id, systemPrompt, message, conversationId, MODE);
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
  }));

  if (supabase && conversationId) {
    await Promise.all(
      responses.map((r) => appendMessage(supabase, conversationId!, "assistant", r.message, r.characterId))
    );
  }

  const synthesisPrompt = buildSynthesisPrompt(message, responses);
  const synthesisResult = await getCharacterReply(
    "synthesis",
    synthesisPrompt,
    "Please give your synthesis now.",
    conversationId,
    MODE
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
