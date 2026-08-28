// Breaks a transcript's plain-text blob into one line per sentence, for
// readability — the raw text from Gemini reads as one dense wall of text
// otherwise. Shared by the on-screen transcript view, the Word export, and
// the copy-to-clipboard text, so all three present it the same way.
//
// Splits right after Chinese sentence-ending punctuation (no trailing space
// needed, since Chinese doesn't put one there) or Latin .!? — but not when a
// "." is immediately followed by a digit, so decimals like "3.6" don't get
// split into "3." + "6". This is a readability heuristic, not a rigorous
// sentence tokenizer — occasional over/under-splitting (abbreviations, etc.)
// is an acceptable trade-off for "not one giant paragraph".
export function splitIntoSentenceLines(text: string): string[] {
  return text
    .split(/(?<=[。！？])|(?<=[.!?])(?!\d)/)
    .map((s) => s.trim())
    .filter(Boolean);
}
