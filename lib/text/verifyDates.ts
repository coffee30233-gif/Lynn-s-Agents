const WEEKDAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"]; // index = Date#getDay()

const DATE_WEEKDAY_PATTERN =
  /(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[（(]\s*(?:週|星期|周)([日一二三四五六天])\s*[）)]/g;

export interface DateInconsistency {
  raw: string;
  statedWeekday: string;
  actualWeekday: string;
}

/**
 * Finds "M月D日（星期X）"-style date+weekday pairs and checks the stated
 * weekday against what that date actually falls on. This is what caught a
 * real bug: a model said "8月16日（星期日）" first (correct — Aug 16, 2026
 * is a Sunday), then "corrected" itself to 8月15日 while keeping 星期日
 * (wrong — the 15th is a Saturday). Prompting the model to be careful about
 * dates isn't reliable (tested, didn't hold); this check doesn't depend on
 * the model at all — it's arithmetic on a real Date object.
 *
 * No year in the text, so this assumes the nearest occurrence of that
 * month/day on or after `referenceDate` (rolling into next year for
 * dates that have already passed this year) — the same assumption a
 * person would make hearing "8月16日" with no year mentioned.
 */
export function findDateInconsistencies(
  content: string,
  referenceDate: Date = new Date()
): DateInconsistency[] {
  const results: DateInconsistency[] = [];
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  for (const m of content.matchAll(DATE_WEEKDAY_PATTERN)) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    const statedChar = m[3] === "天" ? "日" : m[3];
    const statedIndex = WEEKDAY_CHARS.indexOf(statedChar);
    if (statedIndex === -1) continue;

    let candidate = new Date(today.getFullYear(), month - 1, day);
    if (candidate < today) candidate = new Date(today.getFullYear() + 1, month - 1, day);
    const actualIndex = candidate.getDay();

    if (actualIndex !== statedIndex) {
      results.push({
        raw: m[0],
        statedWeekday: `星期${statedChar}`,
        actualWeekday: `星期${WEEKDAY_CHARS[actualIndex]}`,
      });
    }
  }

  return results;
}
