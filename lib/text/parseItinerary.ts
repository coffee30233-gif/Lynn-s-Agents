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
