// Live API's transcript stream sends fragments the way it would for
// space-separated languages — each fragment tends to carry a leading space,
// which reads fine between English words but leaves visible gaps between
// Chinese characters ("你 好" instead of "你好") once fragments are
// concatenated. Only strips the leading space when it's actually sitting
// between two CJK characters, so English spacing is untouched.
//
// Shared by hooks/useLiveSession.ts (per-speaker chat bubbles) and
// hooks/useMeetingLiveSession.ts (one continuous transcript string) — same
// fragment-joining problem either way.
const CJK_CHAR = /[㐀-鿿豈-﫿　-〿＀-￯]/;

export function joinTranscriptText(existing: string, incoming: string): string {
  const trimmed = incoming.replace(/^\s+/, "");
  if (trimmed === incoming) return existing + incoming;
  const lastChar = existing.slice(-1);
  const firstChar = trimmed.slice(0, 1);
  if (CJK_CHAR.test(lastChar) && CJK_CHAR.test(firstChar)) {
    return existing + trimmed;
  }
  return existing + incoming;
}
