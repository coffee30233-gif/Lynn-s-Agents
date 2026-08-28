import "server-only";
import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Originally reused the conversational Live model (gemini-3.1-flash-live-
 * preview, same as lib/voice/liveToken.ts's English coach) with a "stay
 * silent, never respond" system instruction, on the theory that a meeting
 * listener is just a conversational session that never talks. In real
 * testing this reliably connected, streamed audio fine, and got periodic
 * sessionResumptionUpdate heartbeats — but never once produced a
 * serverContent.inputTranscription or interimInputTranscription message,
 * confirmed on real human speech, not just a synthetic-audio test artifact.
 * That symptom exactly matches a known open issue other developers have hit
 * with this same conversational-model + inputAudioTranscription combination
 * (googleapis/js-genai#1212, and a Google AI Developer Forum thread) —
 * unresolved on Google's end, not something fixable from this app's config.
 *
 * Google ships a separate model built specifically for this:
 * gemini-3.5-transcribe-live, "a dedicated, low-latency speech recognition
 * pipeline rather than a conversational agent" (its own docs' wording) —
 * the right tool for a meeting listener that should never talk in the first
 * place, not a conversational model instructed into silence. It responds
 * with Modality.TEXT (this is a transcription model, not a voice one, so
 * there's no spoken audio to ever worry about accidentally playing back),
 * and no system instruction — it isn't a character to direct, just a
 * transcriber.
 */

const LIVE_MODEL_ID = "gemini-3.5-transcribe-live";

export interface MeetingLiveToken {
  token: string;
  model: string;
}

export async function createMeetingLiveToken(): Promise<MeetingLiveToken> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });

  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
      liveConnectConstraints: {
        model: LIVE_MODEL_ID,
        config: {
          responseModalities: [Modality.TEXT],
        },
      },
    },
  });

  if (!token.name) {
    throw new Error("createMeetingLiveToken: Gemini did not return a token");
  }

  return { token: token.name, model: LIVE_MODEL_ID };
}
