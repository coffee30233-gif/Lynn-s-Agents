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
 * Known gotcha (confirmed against a real Gemini API key): if GEMINI_API_KEY
 * is the newer format ("AQ." prefix), authTokens.create() returns
 * INVALID_ARGUMENT. Only the older format ("AIzaSy..." prefix) works with
 * this endpoint today — check the key format first if this starts failing.
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
