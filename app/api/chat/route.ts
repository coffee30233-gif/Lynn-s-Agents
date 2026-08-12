import { NextRequest, NextResponse } from "next/server";
import type { AgentMode, ChatRequestBody, ChatResponseBody } from "@/types";
import { getCharacterById } from "@/lib/characters/registry";
import { loadSkill } from "@/lib/characters/loader";
import { buildSystemPrompt } from "@/lib/agent/promptBuilder";
import { getCharacterReply } from "@/lib/agent/reply";
import type { ConversationTurn } from "@/lib/n8n/client";
import { createClient } from "@/lib/supabase/server";
import { appendMessage, createConversation, getConversationWithMessages } from "@/lib/conversations/queries";
import { getUserMemories } from "@/lib/memory/queries";

function isValidMode(mode: unknown): mode is AgentMode {
  return typeof mode === "string" && ["chat", "think", "plan", "learn", "do"].includes(mode);
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { characterId, message } = body;
  let conversationId = body.conversationId;
  const mode: AgentMode = isValidMode(body.mode) ? body.mode : "chat";

  if (!characterId || typeof characterId !== "string") {
    return NextResponse.json({ error: "characterId is required" }, { status: 400 });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const character = getCharacterById(characterId);
  if (!character) {
    return NextResponse.json({ error: `Unknown character "${characterId}"` }, { status: 404 });
  }

  const skill = loadSkill(character);

  // Same local-dev-convenience pattern as N8N_WEBHOOK_URL: without Supabase
  // configured, chat still works, it just isn't persisted anywhere — and
  // without persistence there's no history to reconstruct or memory to draw
  // on, so each call is a single-turn exchange like before.
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const supabase = supabaseConfigured ? await createClient() : null;

  let messages: ConversationTurn[] = [{ role: "user", content: message }];
  let memories: string[] = [];

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!conversationId) {
      conversationId = await createConversation(supabase, user.id, { characterId: character.id, mode });
    }
    await appendMessage(supabase, conversationId, "user", message);

    // Fetch back what we just wrote so `messages` includes this turn as the
    // last entry, in the same read path used to resume a saved conversation.
    const conversation = await getConversationWithMessages(supabase, conversationId);
    if (conversation) {
      messages = conversation.messages.map((m) => ({ role: m.role, content: m.content }));
    }

    if (character.memory.enabled) {
      memories = await getUserMemories(supabase, { excludeConversationId: conversationId });
    }
  }

  const systemPrompt = buildSystemPrompt(character, skill, mode, memories);
  const result = await getCharacterReply(character.id, systemPrompt, messages, conversationId, mode);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (supabase && conversationId) {
    await appendMessage(supabase, conversationId, "assistant", result.message, character.id);
  }

  const response: ChatResponseBody = {
    characterId: character.id,
    message: result.message,
    conversationId: conversationId ?? crypto.randomUUID(),
  };
  return NextResponse.json(response);
}
