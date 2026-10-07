import "server-only";
import {
  GoogleGenAI,
  Type,
  FileState,
  FinishReason,
  createUserContent,
  createPartFromUri,
  type GenerateContentResponse,
} from "@google/genai";
import type { ActionItem } from "@/lib/meetings/queries";
import { toTraditionalChinese } from "@/lib/text/toTraditional";
import { generateContentWithRetry } from "@/lib/gemini/retry";

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
 * audio-to-text work for one (short) segment of the recording — see
 * lib/meetings/audioSplit.ts and app/api/meetings/[meetingId]/process/route.ts
 * for how segments are produced and orchestrated one invocation at a time —
 * and summarizeTranscript() is a fast, text-only call (no Files API, no
 * audio) over the already-assembled full transcript once every segment is
 * done. Each piece comfortably fits its own 60s budget even when the whole
 * pipeline together wouldn't have.
 *
 * No speaker diarization — this used to label speakers "Speaker A/B/C", but
 * that only ever holds within one segment (Gemini never hears two segments
 * together, so there's no way to know "Speaker A" in segment 2 is the same
 * person as "Speaker A" in segment 1), which needed a manual rename step to
 * fix up and complicated the output for little payoff. Dropped per request —
 * the transcript is now plain text, and action items don't carry a speaker
 * attribution unless a real name was actually said.
 */

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

/** Extracts the JSON text from a response, checking finishReason first — a
 * length-truncated response can still be well-formed, parseable JSON (the
 * schema-constrained output just stops mid-string/mid-object), so silently
 * parsing it would produce a result that looks successful but is quietly
 * incomplete. Surfaced as a real failure instead so a retry is known to be
 * worth doing. */
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

Language: transcribe in the language actually spoken (do not translate).

Break what was said into natural sentences/utterances, covering this ENTIRE
audio segment from start to end — do not summarize, condense, or skip any
part of it, and do not stop early. The only cleanup allowed is removing pure
disfluencies (um/uh, stutters, exact word repetitions) — every topic,
sentence, and exchange that actually happened must be represented. If you
are tempted to shorten this because the segment is long, don't: a long
segment should produce many lines, not fewer. Do not label or attribute
lines to speakers — just the words that were said.

For each line, also report "time": the timestamp in this AUDIO SEGMENT
(not clock time, not the original recording if this is one of several
segments — just how far into the audio you were given, starting at 0:00)
when that line began being said, formatted "MM:SS" (or "H:MM:SS" if the
segment somehow runs past an hour).

Respond only in the requested JSON structure.`;

const TRANSCRIBE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    lines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ["time", "text"],
      },
    },
  },
  required: ["lines"],
};

/** "MM:SS" or "H:MM:SS" -> total seconds. Returns 0 for anything that
 * doesn't parse as plain digits/colons rather than throwing — a malformed
 * timestamp from the model shouldn't take down the whole segment's
 * transcript, just that one line's offset. */
function parseTimestamp(time: string): number {
  const parts = time.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return 0;
}

function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export async function transcribeAudioSegment(
  audio: Blob,
  mimeType: string,
  title: string,
  /** This segment's own start time within the whole meeting, in seconds
   * (segmentIndex * SEGMENT_SECONDS — see lib/meetings/constants.ts) — added
   * to each line's segment-relative "time" from Gemini so the timestamps in
   * the assembled transcript read as one continuous meeting clock instead of
   * every segment restarting at 0:00. */
  segmentStartSeconds: number,
  /** Absolute Date.now()-style timestamp the caller expects to be killed by
   * (Vercel's 60s cap) — used only to decide whether a transient-error retry
   * has any real chance of finishing, not enforced as a hard cutoff here. */
  deadline: number = Date.now() + 55_000
): Promise<string> {
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

  const parsed = JSON.parse(extractJsonOrThrow(response)) as { lines?: unknown };
  if (!Array.isArray(parsed.lines)) throw new Error("Gemini's response was missing the lines field");

  // One "[MM:SS] sentence" per line, joined by newlines — lib/meetings/
  // splitSentences.ts detects this exact shape to render/export one line per
  // sentence without needing to re-derive boundaries from punctuation.
  return parsed.lines
    .filter((line): line is { time: string; text: string } => typeof line?.text === "string")
    .map((line) => {
      const absoluteSeconds = segmentStartSeconds + parseTimestamp(typeof line.time === "string" ? line.time : "0:00");
      // Same backstop as lib/agent/reply.ts's chat replies — the prompt asks
      // for whatever language was spoken, but Gemini has been observed
      // replying in Simplified Chinese despite that. A no-op on English or
      // already-Traditional text.
      return `[${formatTimestamp(absoluteSeconds)}] ${toTraditionalChinese(line.text)}`;
    })
    .join("\n");
}

const SUMMARIZE_PROMPT = `Below is the full transcript of a recorded meeting or conversation (it may have
been transcribed in several segments and stitched together — segment
boundaries carry no meaning, just read it as one continuous conversation).

Produce:
1. A concise summary of what was discussed and any decisions made.
2. A list of concrete action items mentioned. Include an "owner" only if a
   specific person is explicitly named as responsible; otherwise leave it
   null — do not guess, and never invent a placeholder name.
3. Any other notable context, open questions, or decisions that don't belong
   in the action items list.
4. A chapter outline: break the meeting into its major topics/sections, in
   the order they were discussed (like chapters in a podcast or video), each
   with a short title and a substantive description (multiple sentences —
   what was actually discussed, any specific points raised, and how it was
   resolved or left open) — a reader should understand what happened in that
   part of the meeting without needing the full transcript. Aim for
   genuinely distinct topics, not one chapter per minor remark.

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
    chapters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["title", "description"],
      },
    },
  },
  required: ["summary", "actionItems", "notes", "chapters"],
};

export interface Chapter {
  title: string;
  description: string;
}

export interface MeetingSummary {
  summary: string;
  actionItems: ActionItem[];
  notes: string;
  chapters: Chapter[];
}

/** Plain text in, plain text out — no Files API, no audio, so this is fast
 * (a handful of seconds) regardless of how many segments the recording took
 * to transcribe, and isn't expected to need the same retry-budget treatment
 * transcription needed, but goes through the same helper for consistency. */
export async function summarizeTranscript(
  transcript: string,
  deadline: number = Date.now() + 55_000
): Promise<MeetingSummary> {
  const ai = getClient();

  const response = await generateContentWithRetry(
    () =>
      ai.models.generateContent({
        model: MEETING_MODEL_ID,
        contents: [createUserContent([SUMMARIZE_PROMPT + transcript])],
        config: {
          responseMimeType: "application/json",
          responseSchema: SUMMARIZE_SCHEMA,
          maxOutputTokens: 65536,
        },
      }),
    deadline
  );

  const parsed = JSON.parse(extractJsonOrThrow(response)) as Partial<MeetingSummary>;
  if (
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.actionItems) ||
    typeof parsed.notes !== "string" ||
    !Array.isArray(parsed.chapters)
  ) {
    throw new Error("Gemini's response was missing expected fields");
  }
  // Same Simplified->Traditional backstop as transcribeAudioSegment() above
  // — every text field Gemini generated here needs it, not just the summary.
  return {
    summary: toTraditionalChinese(parsed.summary),
    actionItems: parsed.actionItems.map((item) => ({
      text: toTraditionalChinese(item.text),
      owner: item.owner ? toTraditionalChinese(item.owner) : null,
    })),
    notes: toTraditionalChinese(parsed.notes),
    chapters: parsed.chapters.map((c) => ({
      title: toTraditionalChinese(c.title),
      description: toTraditionalChinese(c.description),
    })),
  };
}
