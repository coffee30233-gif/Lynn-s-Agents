import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { AgentMode, Source } from "@/types";

/**
 * Calls Gemini directly instead of going through the self-hosted n8n webhook
 * this used to hand off to (docs/n8n-workflow.md is the old workflow this
 * replaces) — n8n added a hop through a home-network server for zero benefit
 * once the logic it ran (map messages -> Gemini contents, call Gemini with
 * Google Search grounding, shape the response) is just as easy to run here
 * directly, and removes both the extra round trip and that server's own
 * uptime/bandwidth as a failure point. Verified against the real API before
 * wiring this in (contents mapping, Google Search grounding, groundingChunks
 * -> sources, Traditional Chinese output) — see the git history for the
 * throwaway script used, since this exact call shape is preserved here.
 *
 * Same model as the old n8n workflow (gemini-3.1-flash-lite) — this is an
 * infra swap, not a model/quality change, and n8n-workflow.md's own note
 * about it being the one model that dodged a free-tier quota wall across
 * every other model tried still applies to this high-frequency chat path.
 */
const CHAT_MODEL_ID = "gemini-3.1-flash-lite";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export class GeminiChatError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface CallGeminiChatParams {
  systemPrompt: string;
  messages: ConversationTurn[];
  mode: AgentMode;
  timeoutMs?: number;
}

interface CallGeminiChatResult {
  message: string;
  sources: Source[];
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiChatError("GEMINI_API_KEY is not set", 500);
  return new GoogleGenAI({ apiKey });
}

export async function callGeminiChat(params: CallGeminiChatParams): Promise<CallGeminiChatResult> {
  const ai = getClient();

  let response;
  try {
    response = await ai.models.generateContent({
      model: CHAT_MODEL_ID,
      contents: params.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: params.systemPrompt,
        temperature: 0.9,
        maxOutputTokens: 8192,
        tools: [{ googleSearch: {} }],
        abortSignal: AbortSignal.timeout(params.timeoutMs ?? 55000),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new GeminiChatError("Gemini request timed out", 504);
    }
    console.error("[gemini-chat] request failed:", err);
    throw new GeminiChatError("Failed to reach Gemini", 502);
  }

  const candidate = response.candidates?.[0];
  const message =
    candidate?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("") || "Sorry, I couldn't generate a response just now.";

  // Present only when Gemini actually used Google Search grounding for this
  // reply — most turns won't have any. Dedupe by URL since the same source
  // often backs multiple grounding chunks (same logic the old n8n workflow
  // used, see docs/n8n-workflow.md's Shape Response node).
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: Source[] = chunks
    .map((c) => c.web)
    .filter((w): w is { uri: string; title?: string } => {
      if (!w?.uri || seen.has(w.uri)) return false;
      seen.add(w.uri);
      return true;
    })
    .map((w) => ({ title: w.title || w.uri, uri: w.uri }));

  return { message, sources };
}
