"use client";

import { useCallback, useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import { LiveAudioPlayer } from "@/lib/audio/liveAudioPlayer";

/**
 * Live API connection hook — mic capture, streaming playback, and the
 * WebSocket lifecycle for real-time voice conversation with a character.
 * Ported from a working implementation (coffee30233-gif/Speakflow-AI,
 * "聊聊教練") that was confirmed against real devices; kept as close to that
 * proven shape as possible rather than re-deriving the Live API details.
 */

const LIVE_MODEL_ID = "gemini-3.1-flash-live-preview";
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const LIVE_VOICE_NAME = "Kore";

export type LiveSessionStatus = "idle" | "connecting" | "connected" | "error" | "closed";

interface TranscriptEntry {
  role: "user" | "coach";
  text: string;
}

interface LiveServerMessage {
  serverContent?: {
    modelTurn?: {
      parts?: { inlineData?: { mimeType?: string; data?: string } }[];
    };
    interrupted?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
  };
}

interface UseLiveSessionResult {
  status: LiveSessionStatus;
  errorMessage: string | null;
  transcript: TranscriptEntry[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function useLiveSession(characterId: string): UseLiveSessionResult {
  const [status, setStatus] = useState<LiveSessionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const playerRef = useRef<LiveAudioPlayer | null>(null);
  /** Accumulates this session's transcript so it can be saved on disconnect. */
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const saveTriggeredRef = useRef(false);
  /**
   * opencc-js's conversion dictionary is ~1MB uncompressed — loaded via
   * dynamic import (kicked off in connect(), see below) instead of a
   * top-level import, so it doesn't sit in this page's initial JS bundle.
   * By the time transcripts actually start arriving, the token fetch +
   * WebSocket handshake have already given this plenty of time to resolve.
   */
  const toTraditionalRef = useRef<((text: string) => string) | null>(null);

  const convert = useCallback((text: string) => toTraditionalRef.current?.(text) ?? text, []);

  /**
   * Live API transcript messages arrive as fragments (not full sentences).
   * Merge consecutive fragments from the same speaker into one bubble
   * instead of opening a new one per fragment, which reads like a normal
   * chat instead of a broken stream.
   *
   * Also runs the merged text through convert() (Simplified -> Traditional)
   * every update — the system instruction already asks for Traditional
   * Chinese only, but (same lesson as the text-chat path) that's not
   * reliable on its own; the Live model has been observed replying in
   * Simplified despite it. Re-converting the whole merged bubble each time
   * (not just the incoming fragment) avoids missing a multi-character
   * substitution that happens to land across a fragment boundary.
   */
  const appendTranscriptFragment = useCallback(
    (role: "user" | "coach", text: string) => {
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === role) {
          const merged = convert(last.text + text);
          return [...prev.slice(0, -1), { role, text: merged }];
        }
        return [...prev, { role, text: convert(text) }];
      });

      const lastRef = transcriptRef.current[transcriptRef.current.length - 1];
      if (lastRef && lastRef.role === role) {
        lastRef.text = convert(lastRef.text + text);
      } else {
        transcriptRef.current.push({ role, text: convert(text) });
      }
    },
    [convert]
  );

  const stopMic = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  const startMic = useCallback(async () => {
    const audioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    audioContextRef.current = audioContext;

    await audioContext.audioWorklet.addModule("/worklets/pcm-recorder-processor.js");

    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: INPUT_SAMPLE_RATE,
        // Without these, the coach's own voice from the speaker is prone to
        // being picked back up by the mic, which Gemini's voice-activity
        // detection can misread as the user interrupting — cutting the
        // coach off mid-sentence. Not a full fix (headphones are the real
        // fix — see the UI hint), just a mitigation.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    micStreamRef.current = micStream;

    const source = audioContext.createMediaStreamSource(micStream);
    const workletNode = new AudioWorkletNode(audioContext, "pcm-recorder-processor");
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const session = sessionRef.current;
      if (!session) return;
      const base64Audio = arrayBufferToBase64(event.data);
      try {
        session.sendRealtimeInput({
          audio: { data: base64Audio, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` },
        });
      } catch (err) {
        console.error("[useLiveSession] failed to send audio chunk:", err);
      }
    };

    source.connect(workletNode);
    // Deliberately not connected to audioContext.destination — we're only
    // capturing to send, not playing the user's own mic back to them.
  }, []);

  const saveTranscript = useCallback(async () => {
    if (saveTriggeredRef.current) return;
    saveTriggeredRef.current = true;

    const turns = transcriptRef.current;
    if (turns.length === 0) return;

    try {
      await fetch("/api/live/save-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, transcript: turns }),
      });
    } catch (err) {
      console.error("[useLiveSession] failed to save transcript:", err);
    }
  }, [characterId]);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setErrorMessage(null);
    setTranscript([]);
    transcriptRef.current = [];
    saveTriggeredRef.current = false;

    // Fire this in parallel with the token fetch below rather than
    // awaiting it here — both take a moment, no reason to serialize them.
    void import("@/lib/text/toTraditional").then((mod) => {
      toTraditionalRef.current = mod.toTraditionalChinese;
    });

    try {
      const tokenRes = await fetch("/api/live/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(tokenJson?.error ?? "無法取得連線憑證");
      }

      const ai = new GoogleGenAI({ apiKey: tokenJson.token });
      const systemInstruction: string = tokenJson.systemInstruction;

      const player = new LiveAudioPlayer(OUTPUT_SAMPLE_RATE);
      playerRef.current = player;

      const session = await ai.live.connect({
        model: LIVE_MODEL_ID,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: LIVE_VOICE_NAME },
            },
          },
        },
        callbacks: {
          onopen: () => {
            setStatus("connected");
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;

            // User interrupted the AI mid-reply — stop whatever's queued so
            // old and new replies don't overlap.
            if (content?.interrupted) {
              player.interrupt();
              return;
            }

            if (content?.inputTranscription?.text) {
              appendTranscriptFragment("user", content.inputTranscription.text);
            }
            if (content?.outputTranscription?.text) {
              appendTranscriptFragment("coach", content.outputTranscription.text);
            }

            const parts = content?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                void player.enqueueChunk(part.inlineData.data);
              }
            }
          },
          onerror: (e: { message?: string }) => {
            setErrorMessage(e?.message ?? "連線發生錯誤");
            setStatus("error");
          },
          onclose: () => {
            setStatus("closed");
            // Close might be Gemini hanging up rather than the user pressing
            // "end call" — clean up the mic/player and save regardless.
            stopMic();
            playerRef.current?.close();
            playerRef.current = null;
            void saveTranscript();
          },
        },
      });

      sessionRef.current = session;
      await startMic();
    } catch (err) {
      console.error("[useLiveSession] connect failed:", err);
      setErrorMessage(err instanceof Error ? err.message : "連線失敗");
      setStatus("error");
    }
  }, [characterId, appendTranscriptFragment, startMic, stopMic, saveTranscript]);

  const disconnect = useCallback(async () => {
    stopMic();
    playerRef.current?.close();
    playerRef.current = null;
    try {
      sessionRef.current?.close();
    } catch (err) {
      console.error("[useLiveSession] error closing session:", err);
    }
    sessionRef.current = null;
    setStatus("closed");
    await saveTranscript();
  }, [stopMic, saveTranscript]);

  return { status, errorMessage, transcript, connect, disconnect };
}
