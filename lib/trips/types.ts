import type { Source } from "@/types";

// Plain types and pure helpers only — imported by both server code (API
// routes, Gemini calls) and client components, so nothing here may touch
// server-only APIs.

export type TripRegion = "domestic" | "international" | "island";

export const TRIP_REGIONS: TripRegion[] = ["domestic", "international", "island"];

export const REGION_LABEL: Record<TripRegion, string> = {
  domestic: "國內",
  international: "國外",
  island: "離島",
};

/** Spelled out for the Gemini prompts (and as UI hint text) — "國內"/"離島"
 * alone is ambiguous about what counts, and the model needs the boundary. */
export const REGION_HINT: Record<TripRegion, string> = {
  domestic: "台灣本島（縣市、風景區）",
  international: "台灣以外的海外地區",
  island: "台灣的離島（例如澎湖、金門、馬祖、小琉球、綠島、蘭嶼）",
};

/** A longer trip means a longer itinerary to generate, and the detail call
 * has to fit inside Vercel's 60s cap — 10 days measured around 30s for the
 * writing step alone, so this keeps a safety margin. */
export const MAX_TRIP_DAYS = 10;

export interface TripSuggestion {
  destination: string;
  country: string;
  /** One-line hook, shown under the destination name. */
  tagline: string;
  /** Why this place suits this specific date range (season, events, ...). */
  reason: string;
  /** Per person, whole New Taiwan dollars. */
  estimatedBudget: number;
  /** What the estimate covers, e.g. "含機票、4晚住宿與餐飲". */
  budgetNote: string;
}

export interface BudgetItem {
  label: string;
  amount: number;
}

export interface TripHotel {
  name: string;
  area: string;
  /** Whole room, per night, New Taiwan dollars. */
  pricePerNight: number;
  note: string;
}

export interface TripRestaurant {
  name: string;
  cuisine: string;
  pricePerPerson: number;
  note: string;
}

export interface TripExperience {
  name: string;
  price: number;
  note: string;
}

export interface TripDay {
  title: string;
  items: string[];
}

export interface TripPlan {
  overview: string;
  /** Per person. The trip's total is the sum of these — never stored
   * separately, so editing a line can't leave a stale total behind. */
  budget: BudgetItem[];
  hotels: TripHotel[];
  restaurants: TripRestaurant[];
  experiences: TripExperience[];
  days: TripDay[];
  /** Web pages Gemini's search step actually drew on, if it used search. */
  sources: Source[];
}

export function totalBudget(plan: Pick<TripPlan, "budget">): number {
  return plan.budget.reduce((sum, item) => sum + item.amount, 0);
}

export function formatTWD(amount: number): string {
  return `NT$${Math.round(amount).toLocaleString("en-US")}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): Date | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Rejects things like 2026-02-31 that Date silently rolls into March.
  return d.toISOString().slice(0, 10) === value ? d : null;
}

/** Inclusive: 12/20 to 12/24 is 5 days. 0 if either date doesn't parse or
 * the range is backwards. */
export function tripDayCount(startDate: string, endDate: string): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end < start) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** "2026/12/20 – 12/24" (year only repeated when the trip crosses a year). */
export function formatDateRange(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split("-");
  const [ey, em, ed] = endDate.split("-");
  const start = `${sy}/${sm}/${sd}`;
  if (startDate === endDate) return start;
  return `${start} – ${ey === sy ? "" : `${ey}/`}${em}/${ed}`;
}

/** "5天4夜", or "1天" for a day trip. */
export function tripLengthLabel(days: number): string {
  return days <= 1 ? `${Math.max(days, 1)}天` : `${days}天${days - 1}夜`;
}

/** Today's date in Taiwan as YYYY-MM-DD — a trip can't start before this.
 * Explicit timezone for the same reason lib/date/format.ts has one: the
 * server runs in UTC, so a bare new Date() would be a day behind for Taiwan
 * users for the first 8 hours of every day. */
export function todayInTaiwan(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}

/** Returns a user-facing (Traditional Chinese) error message, or null if the
 * request is fine. Shared so the form and the API routes agree on the rules.
 *
 * `allowPast` is for saving/editing an existing trip — generating new
 * suggestions for a date that's already gone is meaningless, but editing a
 * trip's notes after it started (or after it's over) is perfectly normal. */
export function validateTripRequest(
  input: {
    startDate?: unknown;
    endDate?: unknown;
    region?: unknown;
  },
  options: { allowPast?: boolean } = {}
): string | null {
  if (typeof input.startDate !== "string" || typeof input.endDate !== "string") {
    return "請選擇出發與回程日期";
  }
  if (!TRIP_REGIONS.includes(input.region as TripRegion)) {
    return "請選擇國內、國外或離島";
  }
  const days = tripDayCount(input.startDate, input.endDate);
  if (days === 0) return "日期格式不正確，或回程早於出發日期";
  if (days > MAX_TRIP_DAYS) return `行程最多 ${MAX_TRIP_DAYS} 天，請縮短日期區間`;
  if (!options.allowPast && input.startDate < todayInTaiwan()) return "出發日期不能早於今天";
  return null;
}
