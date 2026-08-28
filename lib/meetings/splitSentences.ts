// Breaks a transcript's plain-text blob into one line per sentence, for
// readability. Shared by the on-screen transcript view, the Word export, and
// the copy-to-clipboard text, so all three present it the same way.

// lib/meetings/gemini.ts's transcribeAudioSegment() now asks Gemini for a
// timestamp per sentence and builds exactly one "[MM:SS] sentence" line per
// newline — already properly split, no heuristic needed. Detected via this
// leading tag rather than by guessing from newline density, so meetings
// transcribed before this format shipped (a dense wall of text with only
// occasional paragraph breaks between segments) still fall back to the
// punctuation-based heuristic below instead of rendering as a few giant
// blocks.
const TIMESTAMPED_LINE = /^\[\d{1,2}:\d{2}(?::\d{2})?\]/;

export function splitIntoSentenceLines(text: string): string[] {
  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length > 0 && lines.every((line) => TIMESTAMPED_LINE.test(line))) {
    return lines;
  }

  // Fallback for older, non-timestamped transcripts: split right after
  // Chinese sentence-ending punctuation (no trailing space needed, since
  // Chinese doesn't put one there) or Latin .!? — but not when a "." is
  // immediately followed by a digit, so decimals like "3.6" don't get split
  // into "3." + "6". A readability heuristic, not a rigorous sentence
  // tokenizer — occasional over/under-splitting (abbreviations, etc.) is an
  // acceptable trade-off for "not one giant paragraph".
  return text
    .split(/(?<=[。！？])|(?<=[.!?])(?!\d)/)
    .map((s) => s.trim())
    .filter(Boolean);
}
