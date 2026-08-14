export interface ItinerarySection {
  emoji: string;
  label: string;
  content: string;
}

// Every fixed header the event-planner's output template uses. Matching all
// of them (not just the time periods) means "intro" is left holding only
// genuine chit-chat before/outside the structured plan — which is exactly
// what cleanPlanContent() below needs to be able to drop.
const PERIOD_PATTERN =
  /^(📋|✅|🌅|☀️|🌤️|🌙|🌦️)\s*(活動概覽|籌備時間軸|清晨|上午|下午|晚上|實用資訊)/;

/**
 * Splits saved plan content into a leading "intro" (anything before the
 * first recognized marker) plus one section per marker, so the detail page
 * can render each as its own card instead of one wall of text. Plans that
 * don't use these markers just come back with an empty sections array —
 * intro holds everything, and the page falls back to single-block rendering.
 */
export function parseItinerary(content: string): { intro: string; sections: ItinerarySection[] } {
  const lines = content.split("\n");
  const introLines: string[] = [];
  const sections: ItinerarySection[] = [];
  let current: ItinerarySection | null = null;

  for (const line of lines) {
    const match = line.match(PERIOD_PATTERN);
    if (match) {
      if (current) sections.push(current);
      current = { emoji: match[1], label: match[2], content: "" };
    } else if (current) {
      current.content += (current.content ? "\n" : "") + line;
    } else {
      introLines.push(line);
    }
  }
  if (current) sections.push(current);

  return {
    intro: introLines.join("\n").trim(),
    sections: sections.map((s) => ({ ...s, content: s.content.trim() })),
  };
}

/**
 * For "儲存為行程": drops conversational filler (greetings, follow-up
 * questions like "需要我再調整嗎？") and keeps only the structured plan
 * sections. Replies that never used the template's markers at all (e.g. the
 * user just chatted without triggering a full plan) are left untouched —
 * there's nothing structured to extract, so cleaning would just delete text.
 */
export function cleanPlanContent(content: string): string {
  const { sections } = parseItinerary(content);
  if (sections.length === 0) return content.trim();
  return sections.map((s) => `${s.emoji} ${s.label}\n${s.content}`).join("\n\n");
}

/**
 * Pre-fills the save-as-plan title field from the 📋 活動概覽 block's
 * "目的／名稱：" line, so the user usually just confirms instead of typing
 * one from scratch. Falls back to "" (user types it) when that line isn't
 * found — e.g. a freeform reply that never used the template.
 */
export function suggestPlanTitle(content: string): string {
  const match = content.match(/目的(?:[／/]\s*名稱)?\s*[:：]\s*(.+)/);
  return match ? match[1].trim() : "";
}

/** Same idea as suggestPlanTitle, for the 📋 活動概覽 block's "地點／形式：" line. */
export function suggestPlanLocation(content: string): string {
  const match = content.match(/地點(?:[／/]\s*形式)?\s*[:：]\s*(.+)/);
  return match ? match[1].trim() : "";
}

/**
 * Pulls a date out of the 📋 活動概覽 block's "時間：" line and turns it into a
 * YYYY-MM-DD string for the <input type="date"> field. Accepts both "M月D日"
 * and "M/D" — the AI doesn't consistently pick one, and slash notation
 * (e.g. "8/16（星期日）", "本週六 8/16") turned out to be common enough in
 * practice that only matching "M月D日" left the date field blank most of the
 * time. No year in the source text, so — same assumption as verifyDates.ts —
 * it's taken to mean the nearest occurrence on/after `referenceDate`, rolling
 * into next year if that month/day has already passed this year.
 */
export function suggestPlanDate(content: string, referenceDate: Date = new Date()): string {
  const timeLine = content.match(/時間\s*[:：]\s*(.+)/)?.[1] ?? content;
  const dateMatch =
    timeLine.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/) ??
    timeLine.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/);
  if (!dateMatch) return "";

  const month = parseInt(dateMatch[1], 10);
  const day = parseInt(dateMatch[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  let candidate = new Date(today.getFullYear(), month - 1, day);
  if (candidate < today) candidate = new Date(today.getFullYear() + 1, month - 1, day);

  const yyyy = candidate.getFullYear();
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
