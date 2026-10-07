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
//
// Also pins 臺 back to 台: the cn->tw conversion rewrites 台灣/台北/新台幣 into
// the formal 臺灣/臺北/新臺幣, but everyday Taiwanese writing (including how
// this app's own UI text is written) uses 台 — so replies suddenly saying
// 臺灣 next to UI saying 台灣 reads as inconsistent, not more correct.
const customDict: [string, string][] = [
  ["蝨目魚", "虱目魚"],
  ["臺", "台"],
];
const converter = OpenCC.ConverterFactory(
  OpenCC.Locale.from.cn,
  OpenCC.Locale.to.tw.concat([customDict])
);

export function toTraditionalChinese(text: string): string {
  return converter(text);
}

/** Converts every string inside a JSON-like value (nested objects/arrays) —
 * for structured Gemini output, where the text fields are spread across a
 * whole object tree instead of being one reply string. */
export function toTraditionalDeep<T>(value: T): T {
  if (typeof value === "string") return converter(value) as T;
  if (Array.isArray(value)) return value.map((v) => toTraditionalDeep(v)) as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toTraditionalDeep(v)])) as T;
  }
  return value;
}
