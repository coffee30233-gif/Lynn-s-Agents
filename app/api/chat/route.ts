import { NextRequest, NextResponse } from "next/server";
import type { AgentMode, ChatRequestBody, ChatResponseBody } from "@/types";
import { getCharacterById } from "@/lib/characters/registry";
import { loadSkill } from "@/lib/characters/loader";
import { buildSystemPrompt } from "@/lib/agent/promptBuilder";
import { callN8nChat, N8nError } from "@/lib/n8n/client";

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

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { characterId, message, conversationId } = body;
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

  if (!process.env.N8N_WEBHOOK_URL) {
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));
    const response: ChatResponseBody = {
      characterId: character.id,
      message: pickMockReply(message),
      conversationId: conversationId ?? crypto.randomUUID(),
    };
    return NextResponse.json(response);
  }

  try {
    const response = await callN8nChat({
      characterId: character.id,
      systemPrompt,
      message,
      conversationId,
      mode,
    });
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof N8nError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error calling n8n" }, { status: 500 });
  }
}
