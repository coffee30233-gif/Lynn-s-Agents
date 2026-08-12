import type { AgentMode } from "@/types";
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

export type ReplyResult =
  | { ok: true; message: string }
  | { ok: false; error: string; status: number };

/**
 * Single shared path to "get this character's reply" — used by both
 * /api/chat (one character) and /api/council (many characters in parallel,
 * plus the synthesis agent), so the mock/n8n branching only lives here once.
 */
export async function getCharacterReply(
  characterId: string,
  systemPrompt: string,
  message: string,
  conversationId: string | undefined,
  mode: AgentMode
): Promise<ReplyResult> {
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
