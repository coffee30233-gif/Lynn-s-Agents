import "server-only";
import { GoogleGenAI, Type, FileState, FinishReason, ApiError, createUserContent, createPartFromUri } from "@google/genai";
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
 * real API with scripts/test-meeting-gemini.mjs before settling on
 * "gemini-3.7-flash" originally. Switched to "gemini-3.6-flash" per request
 * (the same model my-passbook-app's bill-recognition feature already uses) —
 * still a non-lite flash tier, so the reasoning above still applies.
 */
const MEETING_MODEL_ID = "gemini-3.6-flash";

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
1. A transcript as speaker-attributed segments, in chronological order,
   covering the ENTIRE recording from start to end — do not summarize,
   condense, or skip any part of the conversation, and do not stop early.
   The only cleanup allowed is removing pure disfluencies (um/uh, stutters,
   exact word repetitions) — every topic, sentence, and exchange that
   actually happened must be represented. If you are tempted to shorten this
   because the recording is long, don't: a long recording should produce a
   long transcript, not a shorter one.
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

// A retry needs real time to have any chance of finishing — an actual
// Vercel timeout observed in production showed 3 POSTs to Gemini (one file
// upload + TWO generateContent attempts) before the function got killed at
// 60s: the retry itself was what used up the remaining budget on an already
// borderline-slow request. Below this much remaining time, don't retry at
// all — surface the error immediately and let the user's own "重試" button
// in MeetingStatusPoller start a fresh attempt with a fresh 60s budget,
// rather than silently burning the current one on a retry that can't finish.
const MIN_REMAINING_MS_TO_RETRY = 15_000;

// 503 (model overloaded) and 429 (rate limited) are both "try again shortly"
// per Google's own guidance, and observed in practice (a fresh flash-tier
// model can be genuinely overloaded at times) — worth a quick retry here
// rather than always pushing that back onto the user, but only when there's
// actually enough of the 60s budget left for it (see above).
async function generateContentWithRetry(ai: GoogleGenAI, fileUri: string, fileMimeType: string, deadline: number) {
  const delaysMs = [2000, 5000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await ai.models.generateContent({
        model: MEETING_MODEL_ID,
        contents: [createUserContent([createPartFromUri(fileUri, fileMimeType), PROMPT])],
        config: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          // gemini-3.6-flash's actual max (confirmed via ai.models.get) — a
          // long meeting's full transcript + summary + action items as JSON
          // can plausibly need more than the 32768 this used to be capped
          // at, which was cutting transcripts short (see the finishReason
          // check below for how that surfaces instead of silently returning
          // a truncated-but-valid-JSON report).
          maxOutputTokens: 65536,
        },
      });
    } catch (err) {
      const isTransient = err instanceof ApiError && (err.status === 503 || err.status === 429);
      const remaining = deadline - Date.now();
      if (!isTransient || attempt >= delaysMs.length || remaining < MIN_REMAINING_MS_TO_RETRY) {
        if (isTransient) console.log(`[meetings] not retrying — ${remaining}ms left, ${(err as ApiError).status}`);
        throw err;
      }
      console.log(`[meetings] generateContent got ${(err as ApiError).status}, retrying in ${delaysMs[attempt]}ms`);
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
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
  title: string,
  /** Absolute Date.now()-style timestamp the caller expects to be killed by
   * (Vercel's 60s cap) — used only to decide whether a transient-error retry
   * has any real chance of finishing, not enforced as a hard cutoff here. */
  deadline: number = Date.now() + 55_000
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

  const response = await generateContentWithRetry(ai, file.uri!, file.mimeType ?? mimeType, deadline);
  const finishReason = response.candidates?.[0]?.finishReason;
  console.log(`[meetings] gemini generateContent done, finishReason=${finishReason}`);

  // A cut-off-by-length response can still be well-formed, parseable JSON
  // (the schema-constrained output just stops mid-array) — silently
  // returning that produced a report that looked successful but had a
  // visibly incomplete transcript. Surface this as a real failure instead so
  // it's distinguishable from "the model chose to condense a lot" in
  // meeting.error, and the user knows retrying (now with a much higher
  // maxOutputTokens ceiling) is worth doing rather than assuming this is
  // just how the feature works.
  if (finishReason === FinishReason.MAX_TOKENS) {
    throw new Error("回覆內容過長，被截斷了（已提高輸出上限，請重試一次）");
  }

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
