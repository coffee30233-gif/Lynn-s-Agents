"use client";

import { useCallback, useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import { MAX_MEETING_AUDIO_BYTES } from "@/lib/meetings/constants";
import { createClient } from "@/lib/supabase/client";
import { joinTranscriptText } from "@/lib/voice/transcriptJoin";
import { uploadMeetingAudioChunked } from "@/lib/meetings/chunkedUpload";
import { splitAudioIntoSegments } from "@/lib/meetings/audioSplit";
import { segmentFolderName } from "@/lib/meetings/segmentPath";

/**
 * Live-recording mode for the meeting assistant. Shares the mic-capture
 * mechanics (AudioWorkletNode -> 16kHz PCM -> Live API) with
 * hooks/useLiveSession.ts, but is a separate hook rather than a shared
 * abstraction: the transcript is one continuous string instead of
 * per-speaker chat bubbles (Live API doesn't diarize; see the MeetingReport
 * note about that), and ending a session uploads a recording through the
 * exact same pipeline the file-upload form uses (POST /api/meetings ->
 * Storage upload -> POST .../process) instead of saving chat messages.
 *
 * Connects with Modality.AUDIO (see lib/meetings/liveToken.ts for why —
 * TEXT-only closed the session almost immediately in testing), but
 * deliberately never wires the received audio chunks to a player the way
 * hooks/useLiveSession.ts does — a meeting assistant audibly interrupting a
 * real meeting would be much worse than staying silent, and the system
 * instruction already tells it not to speak in the first place, so any
 * audio that does come back is just dropped.
 */

const INPUT_SAMPLE_RATE = 16000;

export type MeetingLiveStatus = "idle" | "connecting" | "connected" | "finishing" | "error" | "closed";

interface LiveServerMessage {
  serverContent?: {
    inputTranscription?: { text?: string };
    turnComplete?: boolean;
  };
}

interface UseMeetingLiveSessionResult {
  status: MeetingLiveStatus;
  errorMessage: string | null;
  liveTranscript: string;
  /** True once a recording exists to upload — lets the UI distinguish "retry
   * connecting" (nothing recorded yet) from "retry finishing" (recording's
   * already stopped and captured, only the upload/create-row step failed) so
   * a retry after a failed finish() doesn't discard a good recording by
   * restarting the mic from scratch. */
  canFinish: boolean;
  connect: () => Promise<void>;
  /** Stops recording, uploads what was captured, kicks off processing, and
   * resolves to the new meeting's id (or null if it failed before a row
   * even got created — nothing to navigate to in that case). */
  finish: (title: string) => Promise<string | null>;
}

// The recorder's own container format doesn't matter beyond this hook —
// splitAudioIntoSegments() decodes whatever it produces and re-encodes as
// WAV anyway, so there's no fileExt to track here the way there used to be.
function pickRecorderMimeType(): string {
  // Safari (mac/iOS) doesn't support "audio/webm" for MediaRecorder — falls
  // back to "audio/mp4" (AAC), which it does support.
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const mimeType of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  // Let the browser pick a default rather than throwing — better to record
  // in something than to refuse to record at all.
  return "";
}

export function useMeetingLiveSession(): UseMeetingLiveSessionResult {
  const [status, setStatus] = useState<MeetingLiveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [canFinish, setCanFinish] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recorderMimeTypeRef = useRef("");
  const transcriptRef = useRef("");

  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  }

  const stopMicAndRecorder = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setErrorMessage(null);
    setLiveTranscript("");
    setCanFinish(false);
    transcriptRef.current = "";
    recordedChunksRef.current = [];

    try {
      const tokenRes = await fetch("/api/meetings/live-token", { method: "POST" });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenJson?.error ?? "無法取得連線憑證");

      const ai = new GoogleGenAI({ apiKey: tokenJson.token });

      const session = await ai.live.connect({
        model: tokenJson.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: tokenJson.systemInstruction,
          // Without this, input transcription auto-detects language per
          // utterance and can drift to the wrong one mid-meeting — hinting
          // the likely candidates (Taiwan Mandarin, English) keeps it from
          // wandering into languages nobody in the room is speaking.
          // Confirmed this doesn't get the config rejected before shipping
          // it (a bad Live config closes the session immediately — see the
          // Modality.AUDIO fix above for exactly that failure mode).
          inputAudioTranscription: { languageCodes: ["cmn-Hant-TW", "en-US"] },
        },
        callbacks: {
          onopen: () => setStatus("connected"),
          onmessage: (message: LiveServerMessage) => {
            const text = message.serverContent?.inputTranscription?.text;
            if (text) {
              // Raw += here would leave "你 好" instead of "你好" between
              // fragments (Live API sends them with a leading space, same
              // issue useLiveSession.ts already handles) — this hook was
              // missing that fix entirely until now.
              transcriptRef.current = joinTranscriptText(transcriptRef.current, text);
              setLiveTranscript(transcriptRef.current);
            }
          },
          onerror: (e: { message?: string }) => {
            setErrorMessage(e?.message ?? "連線發生錯誤");
            setStatus("error");
          },
          onclose: () => {
            setStatus((prev) => (prev === "finishing" ? prev : "closed"));
          },
        },
      });
      sessionRef.current = session;

      // Mic setup: same worklet path as useLiveSession.ts, feeding the Live
      // API. In parallel, a MediaRecorder on the same stream captures a
      // storable file for the accurate, speaker-diarized batch pass that
      // runs after the meeting ends (see the module doc comment above).
      const audioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
      audioContextRef.current = audioContext;
      await audioContext.audioWorklet.addModule("/worklets/pcm-recorder-processor.js");

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: INPUT_SAMPLE_RATE, echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = micStream;

      const source = audioContext.createMediaStreamSource(micStream);
      const workletNode = new AudioWorkletNode(audioContext, "pcm-recorder-processor");
      workletNodeRef.current = workletNode;
      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        try {
          sessionRef.current?.sendRealtimeInput({
            audio: { data: arrayBufferToBase64(event.data), mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` },
          });
        } catch (err) {
          console.error("[useMeetingLiveSession] failed to send audio chunk:", err);
        }
      };
      source.connect(workletNode);

      const mimeType = pickRecorderMimeType();
      recorderMimeTypeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(micStream, { mimeType, audioBitsPerSecond: 32000 })
        : new MediaRecorder(micStream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
    } catch (err) {
      console.error("[useMeetingLiveSession] connect failed:", err);
      setErrorMessage(err instanceof Error ? err.message : "連線失敗");
      setStatus("error");
    }
  }, []);

  const finish = useCallback(async (title: string): Promise<string | null> => {
    setStatus("finishing");
    stopMicAndRecorder();
    try {
      sessionRef.current?.close();
    } catch {
      // Already closing/closed — fine to ignore.
    }
    sessionRef.current = null;

    // MediaRecorder flushes its last chunk asynchronously after stop().
    await new Promise((resolve) => setTimeout(resolve, 300));
    // From here on, the recording itself is done and captured — if anything
    // below fails (upload, create-row), a retry should re-attempt the
    // upload, not restart the mic and lose what was already recorded.
    setCanFinish(true);

    const blob = new Blob(recordedChunksRef.current, {
      type: recorderMimeTypeRef.current || "audio/webm",
    });
    if (blob.size === 0) {
      setErrorMessage("沒有錄到任何聲音");
      setStatus("error");
      return null;
    }
    if (blob.size > MAX_MEETING_AUDIO_BYTES) {
      setErrorMessage(
        `錄音有 ${(blob.size / 1024 / 1024).toFixed(0)}MB，超過 ${MAX_MEETING_AUDIO_BYTES / 1024 / 1024}MB 上限，這場會議可能太長了。`
      );
      setStatus("error");
      return null;
    }

    try {
      // Same time-based splitting as the file-upload form — each ~10-minute
      // segment gets its own Gemini call with its own fresh 60s budget
      // server-side. Re-decodes the just-recorded blob rather than reusing
      // recorderMimeTypeRef's format directly, same as any other upload.
      const segments = await splitAudioIntoSegments(blob);

      const createRes = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || "即時會議紀錄", fileExt: "wav", totalSegments: segments.length }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || "建立會議紀錄失敗");

      const supabase = createClient();
      for (let i = 0; i < segments.length; i++) {
        await uploadMeetingAudioChunked(supabase, `${created.audioPath}/${segmentFolderName(i)}`, "wav", segments[i]!);
      }

      fetch(`/api/meetings/${created.id}/process`, { method: "POST" }).catch(() => {});

      setStatus("closed");
      return created.id as string;
    } catch (err) {
      console.error("[useMeetingLiveSession] finish failed:", err);
      setErrorMessage(err instanceof Error ? err.message : "結束會議時發生錯誤");
      setStatus("error");
      return null;
    }
  }, [stopMicAndRecorder]);

  return { status, errorMessage, liveTranscript, canFinish, connect, finish };
}
