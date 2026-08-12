import { NextRequest, NextResponse } from "next/server";
import type { AgentMode, ChatRequestBody, ChatResponseBody } from "@/types";
import { getCharacterById } from "@/lib/characters/registry";
import { loadSkill } from "@/lib/characters/loader";
import { buildSystemPrompt } from "@/lib/agent/promptBuilder";
import { callN8nChat, N8nError } from "@/lib/n8n/client";
import { createClient } from "@/lib/supabase/server";
import { appendMessage, createConversation } from "@/lib/conversations/queries";

// Mock fallback for local dev when N8N_WEBHOOK_URL isn't configured yet.
// See docs/n8n-workflow.md for the real workflow this hands off to once it is.
const MOCK_OPENERS = [
  "Let's start with the actual problem, not the surface one — what are you really trying to solve?",
  "Interesting. What have you already tried, and what happened?",
  "Before I answer — what would make this easy if you were allowed to break the usual assumptions?",
  "Tell me more about the constraint that's actually blocking you.",
];

function pickMockReply(message: string): string {
  const index = message.length % MOCK_OPENERS.length;
  return MOCK_OPENERS[index];
}

function isValidMode(mode: unknown): mode is AgentMode {
  return typeof mode === "string" && ["chat", "think", "plan", "learn", "do"].includes(mode);
}

async function getReply(
  characterId: string,
  systemPrompt: string,
  message: string,
  conversationId: string | undefined,
  mode: AgentMode
): Promise<{ ok: true; message: string } | { ok: false; error: string; status: number }> {
  if (!process.env.N8N_WEBHOOK_URL) {
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));
    return { ok: true, message: pickMockReply(message) };
  }

  try {
    const response = await callN8nChat({ characterId, systemPrompt, message, conversationId, mode });
    return { ok: true, message: response.message };
  } catch (err) {
    if (err instanceof N8nError) return { ok: false, error: err.message, status: err.status };
    return { ok: false, error: "Unexpected error calling n8n", status: 500 };
  }
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
  const systemPrompt = buildSystemPrompt(character, skill, mode);

  // Same local-dev-convenience pattern as N8N_WEBHOOK_URL: without Supabase
  // configured, chat still works, it just isn't persisted anywhere.
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const supabase = supabaseConfigured ? await createClient() : null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!conversationId) {
      conversationId = await createConversation(supabase, user.id, character.id, mode);
    }
    await appendMessage(supabase, conversationId, "user", message);
  }

  const result = await getReply(character.id, systemPrompt, message, conversationId, mode);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (supabase && conversationId) {
    await appendMessage(supabase, conversationId, "assistant", result.message);
  }

  const response: ChatResponseBody = {
    characterId: character.id,
    message: result.message,
    conversationId: conversationId ?? crypto.randomUUID(),
  };
  return NextResponse.json(response);
}
