// Standalone check for lib/meetings/gemini.ts's pipeline (Files API upload ->
// poll for ACTIVE -> generateContent with a JSON responseSchema), run
// directly against the real Gemini API with a short local audio file —
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

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { speaker: { type: Type.STRING }, text: { type: Type.STRING } },
        required: ["speaker", "text"],
      },
    },
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
  required: ["transcript", "summary", "actionItems", "notes"],
};

const PROMPT = `Transcribe this short audio clip. Label speakers "Speaker A", "Speaker B" etc.
by voice, consistently. Write a one-sentence summary, any action items (owner
null if not stated), and any other notes. Respond only in the requested JSON
structure.`;

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
  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [createUserContent([createPartFromUri(file.uri, file.mimeType ?? mimeType), PROMPT])],
    config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, maxOutputTokens: 8192 },
  });
  console.log(`[test] generateContent done (${elapsed(t3)})`);
  console.log(`[test] total elapsed: ${elapsed(t0)}`);

  const text = response.text;
  if (!text) throw new Error("Empty response text");
  const parsed = JSON.parse(text);
  console.log("[test] parsed JSON:");
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((err) => {
  console.error("[test] FAILED:", err);
  process.exit(1);
});
