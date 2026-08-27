import "server-only";
import {
  GoogleGenAI,
  Type,
  FileState,
  FinishReason,
  ApiError,
  createUserContent,
  createPartFromUri,
  type GenerateContentResponse,
} from "@google/genai";
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

/**
 * One generateContent call producing a full transcript AND summary for a
 * long recording was reliably exceeding Vercel's 60s hard cap — the
 * transcript is the dominant cost regardless of whether summary is
 * requested alongside it (JSON is generated in schema order, transcript
 * first, so removing summary from that same call barely moves the needle).
 * Split into two calls instead: transcribeAudioSegment() does ONLY the
 * audio-to-text work for one (short, ~10 minute) segment of the recording
 * — see lib/meetings/audioSplit.ts and app/api/meetings/[meetingId]/process/route.ts
 * for how segments are produced and orchestrated one invocation at a time —
 * and summarizeTranscript() is a fast, text-only call (no Files API, no
 * audio) over the already-assembled full transcript once every segment is
 * done. Each piece comfortably fits its own 60s budget even when the whole
 * pipeline together wouldn't have.
 */

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
// actually enough of the 60s budget left for it (see above). Shared by both
// transcribeAudioSegment and summarizeTranscript.
async function generateContentWithRetry(
  call: () => Promise<GenerateContentResponse>,
  deadline: number
): Promise<GenerateContentResponse> {
  const delaysMs = [2000, 5000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
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

/** Extracts the JSON text from a response, checking finishReason first — a
 * length-truncated response can still be well-formed, parseable JSON (the
 * schema-constrained output just stops mid-array/mid-object), so silently
 * parsing it would produce a result that looks successful but is quietly
 * incomplete. Surfaced as a real failure instead so a retry (now with a much
 * higher maxOutputTokens ceiling, and a much smaller per-call scope than the
 * original single-call design) is known to be worth doing. */
function extractJsonOrThrow(response: GenerateContentResponse): string {
  const finishReason = response.candidates?.[0]?.finishReason;
  console.log(`[meetings] generateContent done, finishReason=${finishReason}`);
  if (finishReason === FinishReason.MAX_TOKENS) {
    throw new Error("回覆內容過長，被截斷了，請重試一次");
  }
  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

const TRANSCRIBE_PROMPT = `You are transcribing one segment of a longer recorded meeting or conversation. You
are only hearing this segment, not the full recording — segments are stitched
together afterward by the calling application, not by you.

Speaker labels: identify distinct speakers by voice and label them "Speaker A",
"Speaker B", "Speaker C", etc., in order of first appearance WITHIN THIS
SEGMENT. Keep each label consistent for the same voice throughout this
segment. If — and only if — a speaker's real name is explicitly said in this
segment (someone addresses them by name, or they introduce themselves), use
that name instead of the generic label for that speaker from that point on
in this segment. Never guess or infer a name that isn't actually spoken.

Language: transcribe in the language actually spoken (do not translate).

Produce a transcript as speaker-attributed segments, in chronological order,
covering this ENTIRE audio segment from start to end — do not summarize,
condense, or skip any part of it, and do not stop early. The only cleanup
allowed is removing pure disfluencies (um/uh, stutters, exact word
repetitions) — every topic, sentence, and exchange that actually happened
must be represented. If you are tempted to shorten this because the segment
is long, don't: a long segment should produce a long transcript, not a
shorter one.

Respond only in the requested JSON structure.`;

const TRANSCRIBE_SCHEMA = {
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
  },
  required: ["transcript"],
};

export async function transcribeAudioSegment(
  audio: Blob,
  mimeType: string,
  title: string,
  /** Absolute Date.now()-style timestamp the caller expects to be killed by
   * (Vercel's 60s cap) — used only to decide whether a transient-error retry
   * has any real chance of finishing, not enforced as a hard cutoff here. */
  deadline: number = Date.now() + 55_000
): Promise<TranscriptSegment[]> {
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

  const response = await generateContentWithRetry(
    () =>
      ai.models.generateContent({
        model: MEETING_MODEL_ID,
        contents: [createUserContent([createPartFromUri(file.uri!, file.mimeType ?? mimeType), TRANSCRIBE_PROMPT])],
        config: {
          responseMimeType: "application/json",
          responseSchema: TRANSCRIBE_SCHEMA,
          maxOutputTokens: 65536, // gemini-3.6-flash's actual max, confirmed via ai.models.get
        },
      }),
    deadline
  );

  const parsed = JSON.parse(extractJsonOrThrow(response)) as { transcript?: unknown };
  if (!Array.isArray(parsed.transcript)) throw new Error("Gemini's response was missing the transcript field");
  return parsed.transcript as TranscriptSegment[];
}

const SUMMARIZE_PROMPT = `Below is the full transcript of a recorded meeting or conversation (it may have
been transcribed in several segments and stitched together — segment
boundaries carry no meaning, just read it as one continuous conversation).
Speaker labels may include a "第N段 " prefix marking which segment a label
came from — the same real person may appear under different-looking labels
in different segments, since segments were transcribed independently.

Produce:
1. A concise summary of what was discussed and any decisions made.
2. A list of concrete action items mentioned. Include an "owner" only if a
   specific person is explicitly stated or unambiguously implied as
   responsible; otherwise leave it null — do not guess.
3. Any other notable context, open questions, or decisions that don't belong
   in the action items list.

Write your response in the same language as the transcript. Respond only in
the requested JSON structure.

TRANSCRIPT:
`;

const SUMMARIZE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
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
  required: ["summary", "actionItems", "notes"],
};

export interface MeetingSummary {
  summary: string;
  actionItems: ActionItem[];
  notes: string;
}

/** Plain text in, plain text out — no Files API, no audio, so this is fast
 * (a handful of seconds) regardless of how many segments the recording took
 * to transcribe, and isn't expected to need the same retry-budget treatment
 * transcription needed, but goes through the same helper for consistency. */
export async function summarizeTranscript(
  transcript: TranscriptSegment[],
  deadline: number = Date.now() + 55_000
): Promise<MeetingSummary> {
  const ai = getClient();
  const transcriptText = transcript.map((seg) => `${seg.speaker}: ${seg.text}`).join("\n");

  const response = await generateContentWithRetry(
    () =>
      ai.models.generateContent({
        model: MEETING_MODEL_ID,
        contents: [createUserContent([SUMMARIZE_PROMPT + transcriptText])],
        config: {
          responseMimeType: "application/json",
          responseSchema: SUMMARIZE_SCHEMA,
          maxOutputTokens: 65536,
        },
      }),
    deadline
  );

  const parsed = JSON.parse(extractJsonOrThrow(response)) as Partial<MeetingSummary>;
  if (typeof parsed.summary !== "string" || !Array.isArray(parsed.actionItems) || typeof parsed.notes !== "string") {
    throw new Error("Gemini's response was missing expected fields");
  }
  return {
    summary: parsed.summary,
    actionItems: parsed.actionItems.map((item) => ({ text: item.text, owner: item.owner ?? null })),
    notes: parsed.notes,
  };
}
