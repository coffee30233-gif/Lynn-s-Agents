import type { AgentMode, ChatResponseBody } from "@/types";

const TIMEOUT_MS = 20000;

export class N8nError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface CallN8nChatParams {
  characterId: string;
  systemPrompt: string;
  messages: ConversationTurn[];
  conversationId?: string;
  mode: AgentMode;
}

/**
 * Calls the n8n webhook that fronts Gemini. See docs/n8n-workflow.md for the
 * workflow this talks to. Secret lives server-side only — never sent to the browser.
 * `messages` is the full turn history for this conversation (latest turn
 * last) — n8n maps it straight into Gemini's multi-turn `contents` array.
 */
export async function callN8nChat(params: CallN8nChatParams): Promise<ChatResponseBody> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new N8nError("N8N_WEBHOOK_URL is not configured", 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "X-Webhook-Secret": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new N8nError("n8n request timed out", 504);
    }
    console.error("[n8n] failed to reach webhook:", err);
    throw new N8nError("Failed to reach n8n webhook", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new N8nError(`n8n webhook returned ${res.status}`, 502);
  }

  const data = await res.json().catch(() => null);
  if (!data || typeof data.message !== "string") {
    console.error("[n8n] unexpected response shape:", JSON.stringify(data));
    throw new N8nError("n8n webhook returned an unexpected response shape", 502);
  }

  return {
    characterId: params.characterId,
    message: data.message,
    conversationId: data.conversationId ?? params.conversationId ?? crypto.randomUUID(),
  };
}
