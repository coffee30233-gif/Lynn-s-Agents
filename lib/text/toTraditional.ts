import * as OpenCC from "opencc-js";

// The system prompt already tells every character to reply in Traditional
// Chinese, but — same lesson as the anti-fabrication instruction in
// SKILL.md — that's a request, not a guarantee. Characters (Elon Musk in
// particular) have replied in Simplified Chinese despite the instruction.
// This is the deterministic backstop: convert once, right where every
// character's reply funnels through (lib/agent/reply.ts), so chat display,
// history, and saved plans are all Traditional regardless of what the model
// actually produced. A no-op on text that's already Traditional or non-Chinese.
const converter = OpenCC.Converter({ from: "cn", to: "tw" });

export function toTraditionalChinese(text: string): string {
  return converter(text);
}
