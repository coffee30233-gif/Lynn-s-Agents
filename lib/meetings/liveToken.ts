import "server-only";
import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Same Live API mechanism as lib/voice/liveToken.ts (the English coach), but
 * for a meeting listener instead of a conversational partner: no character,
 * no skill.
 *
 * Originally tried Modality.TEXT here (a meeting isn't a conversation with
 * the model — it must never speak up over real participants, and TEXT-only
 * output means there's no synthesized speech to accidentally play back at
 * all). In practice the session closed almost immediately after connecting,
 * which points at this specific live-preview model only really supporting
 * AUDIO output — so this uses Modality.AUDIO instead, the modality already
 * proven working for the coach on this exact model, and the audio chunks
 * that come back are simply never wired to a player in
 * hooks/useMeetingLiveSession.ts (unlike the coach's LiveAudioPlayer). Same
 * end result — nothing audible plays — reached a more conservative way.
 *
 * Input transcription (what's picked up by the mic) arrives regardless of
 * the model's own output modality — see hooks/useLiveSession.ts, which reads
 * content.inputTranscription.text without the config explicitly requesting
 * it, so the same is expected to hold here without extra config.
 */

const LIVE_MODEL_ID = "gemini-3.1-flash-live-preview";

const SYSTEM_INSTRUCTION = `You are a silent meeting transcription listener. You are not a participant —
never respond, comment, greet, ask questions, or narrate. Produce no text
output at all. Your only function is listening.`;

export interface MeetingLiveToken {
  token: string;
  model: string;
  systemInstruction: string;
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
          responseModalities: [Modality.AUDIO],
        },
      },
    },
  });

  if (!token.name) {
    throw new Error("createMeetingLiveToken: Gemini did not return a token");
  }

  return { token: token.name, model: LIVE_MODEL_ID, systemInstruction: SYSTEM_INSTRUCTION };
}
