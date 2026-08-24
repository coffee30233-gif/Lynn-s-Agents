import "server-only";
import { GoogleGenAI, Type, FileState, createUserContent, createPartFromUri } from "@google/genai";
import type { TranscriptSegment, ActionItem } from "@/lib/meetings/queries";

/**
 * Meeting transcription/summarization is low-frequency and high-stakes per
 * call (a bad summary of a real meeting is a real cost) — the opposite
 * profile from chat replies, where gemini-3.1-flash-lite was chosen in
 * docs/n8n-workflow.md purely to dodge a free-tier quota wall on every other
 * model tried. Use a non-lite flash tier here for quality; drop to a "-lite"
 * model if this hits the same quota wall in testing.
 *
 * "gemini-3.1-flash" doesn't actually exist (that generation only ships
 * -lite/-lite-preview) — verified the full pipeline (Files API upload ->
 * ACTIVE -> generateContent + JSON responseSchema) end-to-end against the
 * real API with scripts/test-meeting-gemini.mjs before settling on this,
 * the newest non-lite, non-preview flash model available at the time.
 */
const MEETING_MODEL_ID = "gemini-3.7-flash";

const PROMPT = `You are transcribing and summarizing a single recorded meeting or conversation.

Speaker labels: identify distinct speakers by voice and label them "Speaker A",
"Speaker B", "Speaker C", etc., in order of first appearance. Keep each label
consistent for the same voice throughout this recording. If — and only if — a
speaker's real name is explicitly said in the recording (someone addresses them
by name, or they introduce themselves), use that name instead of the generic
label for that speaker from that point on. Never guess or infer a name that
isn't actually spoken.

Language: transcribe in the language actually spoken (do not translate). Write
the summary, action items, and notes in that same language.

Produce:
1. A full transcript as speaker-attributed segments, in chronological order.
2. A concise summary of what was discussed and any decisions made.
3. A list of concrete action items mentioned. Include an "owner" only if a
   specific person is explicitly stated or unambiguously implied as
   responsible; otherwise leave it null — do not guess.
4. Any other notable context, open questions, or decisions that don't belong
   in the action items list.

Respond only in the requested JSON structure.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ["speaker", "text"],
      },
    },
    summary: { type: Type.STRING },
    actionItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          owner: { type: Type.STRING, nullable: true },
        },
        required: ["text"],
      },
    },
    notes: { type: Type.STRING },
  },
  required: ["transcript", "summary", "actionItems", "notes"],
};

export interface MeetingReport {
  transcript: TranscriptSegment[];
  summary: string;
  actionItems: ActionItem[];
  notes: string;
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

/**
 * One un-chunked call over the whole recording — see docs/plans for why:
 * short-circuiting to audio chunking would need client-side ffmpeg.wasm and
 * breaks speaker-label continuity across chunk boundaries, and it's not
 * confirmed a single call for a long meeting actually needs it. The
 * console.log calls below are the only way to tell, after the fact, which
 * stage was still running if Vercel's 60s cap kills the request mid-flight
 * (a hard kill doesn't get to run a catch block).
 */
export async function generateMeetingReport(
  audio: Blob,
  mimeType: string,
  title: string
): Promise<MeetingReport> {
  const ai = getClient();

  const uploaded = await ai.files.upload({ file: audio, config: { mimeType, displayName: title } });
  console.log(`[meetings] gemini file uploaded: ${uploaded.name}`);
  if (!uploaded.name || !uploaded.uri) throw new Error("Gemini did not return a file name/uri");

  let file = uploaded;
  while (file.state === FileState.PROCESSING) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    file = await ai.files.get({ name: uploaded.name! });
  }
  if (file.state !== FileState.ACTIVE) {
    throw new Error(`Gemini file processing failed (state: ${file.state})`);
  }
  console.log(`[meetings] gemini file active: ${file.name}`);

  const response = await ai.models.generateContent({
    model: MEETING_MODEL_ID,
    contents: [createUserContent([createPartFromUri(file.uri!, file.mimeType ?? mimeType), PROMPT])],
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 32768,
    },
  });
  console.log("[meetings] gemini generateContent done");

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini's response wasn't valid JSON");
  }

  const report = parsed as Partial<MeetingReport>;
  if (
    !Array.isArray(report.transcript) ||
    typeof report.summary !== "string" ||
    !Array.isArray(report.actionItems) ||
    typeof report.notes !== "string"
  ) {
    throw new Error("Gemini's response was missing expected fields");
  }

  return {
    transcript: report.transcript,
    summary: report.summary,
    actionItems: report.actionItems.map((item) => ({ text: item.text, owner: item.owner ?? null })),
    notes: report.notes,
  };
}
