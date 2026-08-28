// Standalone check for lib/meetings/gemini.ts's two-call pipeline:
// transcribeAudioSegment() (Files API upload -> poll ACTIVE -> generateContent
// with a plain-text transcript schema, no speaker diarization) then
// summarizeTranscript() (fast, text-only call over the result) — run
// directly against the real Gemini API with a short local audio file,
// independent of Next.js/Supabase/auth, so a failure here points at the
// Gemini call itself rather than anything else in the request chain.
//
// Usage: node scripts/test-meeting-gemini.mjs <path-to-audio-file>
// Needs GEMINI_API_KEY in the environment (e.g. `set -a; . .env.local; set +a`
// first, or export it directly).

import { readFileSync } from "node:fs";
import { GoogleGenAI, Type, FileState, createUserContent, createPartFromUri } from "@google/genai";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/test-meeting-gemini.mjs <path-to-audio-file>");
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in the environment");
  process.exit(1);
}

const EXT_TO_MIME = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  ogg: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
};
const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
const mimeType = EXT_TO_MIME[ext] ?? "audio/mpeg";

const MODEL_ID = "gemini-3.6-flash";

const TRANSCRIBE_SCHEMA = {
  type: Type.OBJECT,
  properties: { transcript: { type: Type.STRING } },
  required: ["transcript"],
};

const TRANSCRIBE_PROMPT = `Transcribe this audio clip in full, covering it from start to end — do not
condense or skip anything, only clean up filler words (um/uh). Do not label
or attribute lines to speakers — just the words that were said, as plain
continuous text. Respond only in the requested JSON structure.`;

const SUMMARIZE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    actionItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING }, owner: { type: Type.STRING, nullable: true } },
        required: ["text"],
      },
    },
    notes: { type: Type.STRING },
  },
  required: ["summary", "actionItems", "notes"],
};

function elapsed(start) {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

async function main() {
  const t0 = Date.now();
  const bytes = readFileSync(filePath);
  const blob = new Blob([bytes], { type: mimeType });
  console.log(`[test] read ${filePath} (${(bytes.length / 1024).toFixed(0)} KB, ${mimeType})`);

  const ai = new GoogleGenAI({ apiKey });

  const t1 = Date.now();
  const uploaded = await ai.files.upload({ file: blob, config: { mimeType, displayName: "test-meeting-gemini" } });
  console.log(`[test] uploaded: ${uploaded.name} (${elapsed(t1)})`);

  const t2 = Date.now();
  let file = uploaded;
  while (file.state === FileState.PROCESSING) {
    await new Promise((r) => setTimeout(r, 2000));
    file = await ai.files.get({ name: uploaded.name });
    console.log(`[test] polling... state=${file.state} (${elapsed(t2)})`);
  }
  if (file.state !== FileState.ACTIVE) {
    throw new Error(`File did not become ACTIVE (state: ${file.state})`);
  }
  console.log(`[test] file ACTIVE (${elapsed(t2)} total)`);

  const t3 = Date.now();
  const transcribeResponse = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [createUserContent([createPartFromUri(file.uri, file.mimeType ?? mimeType), TRANSCRIBE_PROMPT])],
    config: { responseMimeType: "application/json", responseSchema: TRANSCRIBE_SCHEMA, maxOutputTokens: 65536 },
  });
  console.log(`[test] transcribe done (${elapsed(t3)}), finishReason=${transcribeResponse.candidates?.[0]?.finishReason}`);
  const transcript = JSON.parse(transcribeResponse.text).transcript;
  console.log("[test] transcript:");
  console.log(transcript);

  const t4 = Date.now();
  const summarizeResponse = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [
      createUserContent([
        `Summarize this transcript: action items (owner null if not stated, never a placeholder), and any other notes. Respond only in the requested JSON structure.\n\nTRANSCRIPT:\n${transcript}`,
      ]),
    ],
    config: { responseMimeType: "application/json", responseSchema: SUMMARIZE_SCHEMA, maxOutputTokens: 65536 },
  });
  console.log(`[test] summarize done (${elapsed(t4)}), finishReason=${summarizeResponse.candidates?.[0]?.finishReason}`);
  console.log("[test] summary:");
  console.log(JSON.stringify(JSON.parse(summarizeResponse.text), null, 2));

  console.log(`[test] total elapsed: ${elapsed(t0)}`);
}

main().catch((err) => {
  console.error("[test] FAILED:", err);
  process.exit(1);
});
