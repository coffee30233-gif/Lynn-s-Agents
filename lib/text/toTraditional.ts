import * as OpenCC from "opencc-js";

// The system prompt already tells every character to reply in Traditional
// Chinese, but — same lesson as the anti-fabrication instruction in
// SKILL.md — that's a request, not a guarantee. Characters (Elon Musk in
// particular) have replied in Simplified Chinese despite the instruction.
// This is the deterministic backstop: convert once, right where every
// character's reply funnels through (lib/agent/reply.ts), so chat display,
// history, and saved plans are all Traditional regardless of what the model
// actually produced. A no-op on text that's already Traditional or non-Chinese
// — except for characters Mainland simplification merged into one form (e.g.
// 蝨 simplifies to 虱), where cn->tw "corrects" already-correct Taiwan usage
// back to the wrong variant. 虱目魚 (milkfish) is conventionally written with
// 虱 in Taiwan, not 蝨, so it needs pinning back after the base conversion —
// add more entries here if the same merge shows up for other terms.
const customDict: [string, string][] = [["蝨目魚", "虱目魚"]];
const converter = OpenCC.ConverterFactory(
  OpenCC.Locale.from.cn,
  OpenCC.Locale.to.tw.concat([customDict])
);

export function toTraditionalChinese(text: string): string {
  return converter(text);
}
