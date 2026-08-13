export interface ItinerarySection {
  emoji: string;
  label: string;
  content: string;
}

const PERIOD_PATTERN = /^(🌅|☀️|🌤️|🌙)\s*(清晨|上午|下午|晚上)/;

/**
 * Splits saved plan content into a leading "intro" (overview, practical
 * info, anything before the first time-of-day marker) plus one section per
 * 🌅清晨/☀️上午/🌤️下午/🌙晚上 marker, so the detail page can render each
 * period as its own card instead of one wall of text. Plans that don't use
 * these markers just come back with an empty sections array — intro holds
 * everything, and the page falls back to today's single-block rendering.
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
