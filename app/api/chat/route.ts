import { NextRequest, NextResponse } from "next/server";
import type { AgentMode, ChatRequestBody, ChatResponseBody } from "@/types";
import { getCharacterById } from "@/lib/characters/registry";
import { loadSkill } from "@/lib/characters/loader";
import { buildSystemPrompt } from "@/lib/agent/promptBuilder";

// Phase 1: no n8n/Gemini call yet — this returns a canned, character-flavored
// reply. The system prompt below is already built from the real SKILL.md so
// that swapping in the n8n call in Phase 2 is a one-line change (POST this
// prompt + message to N8N_WEBHOOK_URL instead of picking a canned line).
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
  buildSystemPrompt(character, skill, mode); // wired for Phase 2, unused by the mock reply itself

  // Small artificial delay so the "thinking" UI state is visible in Phase 1.
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));

  const response: ChatResponseBody = {
    characterId: character.id,
    message: pickMockReply(message),
    conversationId: conversationId ?? crypto.randomUUID(),
  };

  return NextResponse.json(response);
}
