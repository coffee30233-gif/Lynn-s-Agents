import type { AgentMode, Source } from "@/types";
import { callGeminiChat, GeminiChatError, type ConversationTurn } from "@/lib/agent/gemini";
import { toTraditionalChinese } from "@/lib/text/toTraditional";

// Mock fallback for local dev when GEMINI_API_KEY isn't configured yet.
const MOCK_OPENERS = [
  "Let's start with the actual problem, not the surface one — what are you really trying to solve?",
  "Interesting. What have you already tried, and what happened?",
  "Before I answer — what would make this easy if you were allowed to break the usual assumptions?",
  "Tell me more about the constraint that's actually blocking you.",
];

function pickMockReply(lastMessage: string): string {
  const index = lastMessage.length % MOCK_OPENERS.length;
  return MOCK_OPENERS[index];
}

export type ReplyResult =
  | { ok: true; message: string; sources: Source[] }
  | { ok: false; error: string; status: number };

/**
 * Single shared path to "get this character's reply" — used by both
 * /api/chat (one character) and /api/council (many characters in parallel,
 * plus the synthesis agent), so the mock/Gemini branching only lives here
 * once. `messages` is the full turn history, latest turn last.
 *
 * characterId/conversationId stay in the signature even though this no
 * longer needs them (there's no webhook to route by character anymore, and
 * Gemini itself doesn't need a conversation id) — both callers already pass
 * them and every character-specific behavior lives in systemPrompt, so
 * changing the signature would just be churn for its own sake.
 */
export async function getCharacterReply(
  characterId: string,
  systemPrompt: string,
  messages: ConversationTurn[],
  conversationId: string | undefined,
  mode: AgentMode,
  timeoutMs?: number
): Promise<ReplyResult> {
  if (!process.env.GEMINI_API_KEY) {
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));
    const lastMessage = messages[messages.length - 1]?.content ?? "";
    return { ok: true, message: pickMockReply(lastMessage), sources: [] };
  }

  try {
    const response = await callGeminiChat({ systemPrompt, messages, mode, timeoutMs });
    return { ok: true, message: toTraditionalChinese(response.message), sources: response.sources ?? [] };
  } catch (err) {
    if (err instanceof GeminiChatError) return { ok: false, error: err.message, status: err.status };
    return { ok: false, error: "Unexpected error calling Gemini", status: 500 };
  }
}
