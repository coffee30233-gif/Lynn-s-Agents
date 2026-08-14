import "server-only";
import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Live API (gemini-3.1-flash-live-preview) is a WebSocket connection meant to
 * be opened directly from the browser to Google — routing real-time audio
 * through our own serverless function would add a hop of latency and
 * serverless functions aren't built for long-lived connections anyway.
 *
 * The browser can't hold the real GEMINI_API_KEY (it would leak), so this
 * mints a short-lived ephemeral token server-side instead — the browser only
 * ever sees this token, which expires and can only open one connection.
 *
 * Note on key format: Google is migrating Gemini API keys from the legacy
 * "AIzaSy..." format to a newer "AQ." format, and AI Studio now issues only
 * the new format — legacy keys stop working entirely in September 2026, so
 * the new format is the only viable long-term option regardless. Early on,
 * authTokens.create() rejected "AQ." keys with INVALID_ARGUMENT, but Google
 * confirmed that fixed as of May 2026. If token minting fails, check the
 * error message and Google's AI Developer Forum rather than assuming it's
 * still this same key-format issue.
 */

const LIVE_MODEL_ID = "models/gemini-3.1-flash-live-preview";

export interface LiveSessionToken {
  token: string;
  model: string;
}

export async function createLiveSessionToken(): Promise<LiveSessionToken> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  // Ephemeral token minting is only available on the v1alpha API surface,
  // different from whatever default version other Gemini calls use — hence
  // a separate client instance here.
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });

  const token = await ai.authTokens.create({
    config: {
      uses: 1, // Single use — good for exactly one connection, then void.
      newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(), // must connect within 1 min
      liveConnectConstraints: {
        model: LIVE_MODEL_ID,
        config: {
          responseModalities: [Modality.AUDIO],
        },
      },
    },
  });

  if (!token.name) {
    throw new Error("createLiveSessionToken: Gemini did not return a token");
  }

  return { token: token.name, model: LIVE_MODEL_ID };
}
