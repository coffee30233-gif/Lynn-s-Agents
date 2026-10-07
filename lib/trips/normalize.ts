import type { Source } from "@/types";
import type {
  BudgetItem,
  TripDay,
  TripExperience,
  TripHotel,
  TripPlan,
  TripRestaurant,
  TripSuggestion,
} from "./types";

// Coerces unknown input into well-formed trip data. Used on both kinds of
// untrusted input this feature has: Gemini's JSON (schema-constrained, but a
// number can still come back as NaN or a list far longer than asked for) and
// the edited plan the browser sends back on save — a client can post
// anything, and this ends up in a jsonb column and rendered links, so
// everything is clamped here rather than trusted.

const MAX_TEXT = 2000;
const MAX_SHORT_TEXT = 200;

function str(value: unknown, max = MAX_SHORT_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 100_000_000) : 0;
}

function list<T>(value: unknown, max: number, map: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    if (out.length >= max) break;
    const mapped = map(item);
    if (mapped !== null) out.push(mapped);
  }
  return out;
}

function obj(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Only http(s) links — sources are rendered as <a href>, and a saved
 * "javascript:" URI there would be a stored-XSS vector. */
export function normalizeSources(value: unknown): Source[] {
  const seen = new Set<string>();
  return list(value, 10, (item) => {
    const o = obj(item);
    const uri = str(o?.uri, 2000);
    if (!/^https?:\/\//i.test(uri) || seen.has(uri)) return null;
    seen.add(uri);
    return { title: str(o?.title) || uri, uri };
  });
}

export function normalizeSuggestion(raw: unknown): TripSuggestion | null {
  const o = obj(raw);
  const destination = str(o?.destination);
  if (!o || !destination) return null;
  return {
    destination,
    country: str(o.country),
    tagline: str(o.tagline),
    reason: str(o.reason, MAX_TEXT),
    estimatedBudget: money(o.estimatedBudget),
    budgetNote: str(o.budgetNote),
  };
}

export function normalizeTripPlan(raw: unknown): TripPlan {
  const o = obj(raw) ?? {};

  const budget = list<BudgetItem>(o.budget, 12, (item) => {
    const b = obj(item);
    const label = str(b?.label);
    return b && label ? { label, amount: money(b.amount) } : null;
  });

  const hotels = list<TripHotel>(o.hotels, 8, (item) => {
    const h = obj(item);
    const name = str(h?.name);
    return h && name
      ? { name, area: str(h.area), pricePerNight: money(h.pricePerNight), note: str(h.note, MAX_TEXT) }
      : null;
  });

  const restaurants = list<TripRestaurant>(o.restaurants, 12, (item) => {
    const r = obj(item);
    const name = str(r?.name);
    return r && name
      ? { name, cuisine: str(r.cuisine), pricePerPerson: money(r.pricePerPerson), note: str(r.note, MAX_TEXT) }
      : null;
  });

  const experiences = list<TripExperience>(o.experiences, 12, (item) => {
    const e = obj(item);
    const name = str(e?.name);
    return e && name ? { name, price: money(e.price), note: str(e.note, MAX_TEXT) } : null;
  });

  const days = list<TripDay>(o.days, 14, (item) => {
    const d = obj(item);
    if (!d) return null;
    const items = list(d.items, 15, (line) => str(line, MAX_TEXT) || null);
    const title = str(d.title);
    return title || items.length > 0 ? { title, items } : null;
  });

  return {
    overview: str(o.overview, MAX_TEXT),
    budget,
    hotels,
    restaurants,
    experiences,
    days,
    sources: normalizeSources(o.sources),
  };
}
