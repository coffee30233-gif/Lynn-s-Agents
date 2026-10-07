import "server-only";
import { GoogleGenAI, Type, FinishReason, type GenerateContentResponse } from "@google/genai";
import type { Source } from "@/types";
import { generateContentWithRetry } from "@/lib/gemini/retry";
import { toTraditionalDeep } from "@/lib/text/toTraditional";
import { normalizeSources, normalizeSuggestion, normalizeTripPlan } from "./normalize";
import {
  REGION_HINT,
  REGION_LABEL,
  formatTWD,
  totalBudget,
  tripDayCount,
  tripLengthLabel,
  type TripPlan,
  type TripRegion,
  type TripSuggestion,
} from "./types";

/**
 * Both trip-planner calls (top-5 destinations, and the full plan for one
 * destination) run in two steps instead of one:
 *
 *  1. RESEARCH — Google Search grounding, free-form notes, no output schema.
 *  2. WRITE — turn those notes into the structured JSON the UI renders, no
 *     tools.
 *
 * Measured against the real API: with a responseSchema set, Gemini simply
 * never invokes the search tool (zero search queries, zero grounding chunks,
 * on both gemini-3.6-flash and gemini-3.1-flash-lite, even when the prompt
 * explicitly demanded it) — so a single "search + structured output" call
 * silently degrades into hotel/restaurant names and prices recalled from
 * memory. Splitting them keeps search actually running, and the pages it
 * used come back as `sources` to show alongside the plan. Research uses the
 * fast lite model (search-heavy, 5-10s); the writing step is where
 * itinerary quality comes from, so the detail call spends the stronger
 * model there. Everything has to fit Vercel's 60s cap — see MAX_TRIP_DAYS.
 */
const RESEARCH_MODEL = "gemini-3.1-flash-lite";
const SUGGEST_WRITE_MODEL = "gemini-3.1-flash-lite";
const DETAIL_WRITE_MODEL = "gemini-3.6-flash";

export class TripGenerationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new TripGenerationError("GEMINI_API_KEY is not set", 500);
  return new GoogleGenAI({ apiKey });
}

function remaining(deadline: number): number {
  return Math.max(1000, deadline - Date.now());
}

/** Maps a failure from the Gemini SDK/abort into a TripGenerationError the
 * routes can turn into a friendly message. */
function wrapGeminiError(err: unknown): never {
  if (err instanceof TripGenerationError) throw err;
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    throw new TripGenerationError("產生行程花的時間太久了，請再試一次", 504);
  }
  console.error("[trips] Gemini call failed:", err);
  throw new TripGenerationError("無法連線到 AI 服務，請稍後再試", 502);
}

interface ResearchQuestion {
  /** Heading the answer is filed under in the merged notes. */
  label: string;
  prompt: string;
}

/**
 * Asks several short, focused questions in parallel and merges the answers.
 * Short on purpose: measured against the real API, one long multi-part
 * research prompt got zero searches even with the tool enabled and the
 * prompt demanding it (the model answered from memory), while short
 * single-topic questions that open with "請用 Google 搜尋" did trigger
 * search — at least for the price-sensitive ones (lodging, attractions).
 * Whether it searches is still the model's call per question, which is why
 * the final plan's `sources` can legitimately be empty. Parallel, so four
 * questions cost about the same wall-clock time as one.
 */
async function research(
  ai: GoogleGenAI,
  questions: ResearchQuestion[],
  deadline: number
): Promise<{ notes: string; sources: Source[] }> {
  const answers = await Promise.all(
    questions.map(async (q) => {
      let response: GenerateContentResponse;
      try {
        response = await generateContentWithRetry(
          () =>
            ai.models.generateContent({
              model: RESEARCH_MODEL,
              contents: q.prompt,
              config: {
                tools: [{ googleSearch: {} }],
                maxOutputTokens: 4096,
                abortSignal: AbortSignal.timeout(remaining(deadline)),
              },
            }),
          deadline
        );
      } catch (err) {
        wrapGeminiError(err);
      }

      const candidate = response.candidates?.[0];
      const text = candidate?.content?.parts
        ?.map((p) => p.text)
        .filter(Boolean)
        .join("");
      const chunks = (candidate?.groundingMetadata?.groundingChunks ?? []).map((c) => ({
        title: c.web?.title,
        uri: c.web?.uri,
      }));
      return { label: q.label, text: text ?? "", chunks };
    })
  );

  const usable = answers.filter((a) => a.text.trim());
  if (usable.length === 0) throw new TripGenerationError("AI 沒有回傳任何資料，請再試一次", 502);

  const notes = usable.map((a) => `【${a.label}】\n${a.text.trim()}`).join("\n\n");
  const sources = normalizeSources(answers.flatMap((a) => a.chunks));
  console.log(`[trips] research done, ${usable.length}/${questions.length} answers, ${sources.length} sources`);
  return { notes, sources };
}

async function writeJson(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  schema: object,
  maxOutputTokens: number,
  deadline: number
): Promise<unknown> {
  let response: GenerateContentResponse;
  try {
    response = await generateContentWithRetry(
      () =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            maxOutputTokens,
            abortSignal: AbortSignal.timeout(remaining(deadline)),
          },
        }),
      deadline
    );
  } catch (err) {
    wrapGeminiError(err);
  }

  const finishReason = response.candidates?.[0]?.finishReason;
  console.log(`[trips] write (${model}) done, finishReason=${finishReason}`);
  if (finishReason === FinishReason.MAX_TOKENS) {
    throw new TripGenerationError("行程內容太長被截斷了，請再試一次", 502);
  }
  const text = response.text;
  if (!text) throw new TripGenerationError("AI 沒有回傳任何資料，請再試一次", 502);
  try {
    return JSON.parse(text);
  } catch {
    throw new TripGenerationError("AI 回傳的格式有誤，請再試一次", 502);
  }
}

// Shared by both research prompts so the budget the user sees on a
// suggestion card and the breakdown in its detail view mean the same thing.
const BUDGET_ASSUMPTIONS =
  "預算一律指「每人總花費」，以新台幣計：含從台灣出發的來回交通、住宿（以兩人同房平分計）、餐飲、當地交通與基本體驗，中等舒適程度；外幣請依近期大致匯率換算成新台幣。";

const REGION_CONSTRAINT: Record<TripRegion, string> = {
  domestic: "目的地必須在台灣本島，不要列出離島或海外。",
  island: "目的地必須是台灣的離島（例如澎湖、金門、馬祖、小琉球、綠島、蘭嶼），不要列出台灣本島或海外。",
  international: "目的地必須在台灣以外；請盡量多元，不要五個都在同一個國家。",
};

const SUGGEST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    suggestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          destination: { type: Type.STRING },
          country: { type: Type.STRING },
          tagline: { type: Type.STRING },
          reason: { type: Type.STRING },
          estimatedBudget: { type: Type.NUMBER },
          budgetNote: { type: Type.STRING },
        },
        required: ["destination", "country", "tagline", "reason", "estimatedBudget", "budgetNote"],
      },
    },
  },
  required: ["suggestions"],
};

export interface TripRequest {
  region: TripRegion;
  startDate: string;
  endDate: string;
}

function lengthText(req: TripRequest): string {
  return tripLengthLabel(tripDayCount(req.startDate, req.endDate));
}

export interface SuggestRequest extends TripRequest {
  /** Destinations already shown — "換一批" asks for five different ones. */
  exclude?: string[];
}

export async function suggestDestinations(
  req: SuggestRequest,
  deadline: number = Date.now() + 55_000
): Promise<TripSuggestion[]> {
  const ai = getClient();
  const excludeLine =
    req.exclude && req.exclude.length > 0
      ? `\n已經推薦過這些目的地，請不要再列出：${req.exclude.join("、")}。`
      : "";

  const { notes } = await research(
    ai,
    [
      {
        label: "推薦目的地研究",
        prompt: `請用 Google 搜尋，找出最適合在 ${req.startDate} 到 ${req.endDate}（${lengthText(req)}）從台灣出發前往「${REGION_LABEL[req.region]}」（${REGION_HINT[req.region]}）旅遊的前五名目的地。每個目的地請列出：這個時段的天氣與節慶活動亮點、從台灣出發的來回交通大致費用、住宿與餐飲一般價位，以及合理的每人總預算（新台幣）。

${BUDGET_ASSUMPTIONS}
${REGION_CONSTRAINT[req.region]}${excludeLine}`,
      },
    ],
    deadline
  );

  const parsed = (await writeJson(
    ai,
    SUGGEST_WRITE_MODEL,
    `根據下列研究筆記，整理出恰好五個旅行目的地推薦，依推薦程度由高到低排序（最適合這個時段的排最前面）。

欄位說明：
- destination：目的地名稱
- country：國家（台灣的目的地填「台灣」）
- tagline：一句話亮點，20 字以內
- reason：為什麼適合這個日期區間，1-2 句
- estimatedBudget：每人總預算，新台幣整數，要與研究筆記一致
- budgetNote：預算包含哪些項目，一句話

${BUDGET_ASSUMPTIONS}
${REGION_CONSTRAINT[req.region]}${excludeLine}
全部使用繁體中文。

研究筆記：
${notes}`,
    SUGGEST_SCHEMA,
    8192,
    deadline
  )) as { suggestions?: unknown };

  const raw = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const suggestions = toTraditionalDeep(raw)
    .map(normalizeSuggestion)
    .filter((s): s is TripSuggestion => s !== null)
    .slice(0, 5);
  if (suggestions.length === 0) throw new TripGenerationError("AI 沒有產生任何推薦，請再試一次", 502);
  return suggestions;
}

const DETAIL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overview: { type: Type.STRING },
    budget: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { label: { type: Type.STRING }, amount: { type: Type.NUMBER } },
        required: ["label", "amount"],
      },
    },
    hotels: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          area: { type: Type.STRING },
          pricePerNight: { type: Type.NUMBER },
          note: { type: Type.STRING },
        },
        required: ["name", "area", "pricePerNight", "note"],
      },
    },
    restaurants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          cuisine: { type: Type.STRING },
          pricePerPerson: { type: Type.NUMBER },
          note: { type: Type.STRING },
        },
        required: ["name", "cuisine", "pricePerPerson", "note"],
      },
    },
    experiences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING }, price: { type: Type.NUMBER }, note: { type: Type.STRING } },
        required: ["name", "price", "note"],
      },
    },
    days: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { title: { type: Type.STRING }, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
        required: ["title", "items"],
      },
    },
  },
  required: ["overview", "budget", "hotels", "restaurants", "experiences", "days"],
};

export interface TripDetailRequest extends TripRequest {
  destination: string;
  country: string;
  /** What the user saw on the suggestion card, if they came from one — the
   * plan's breakdown is scaled to add up to exactly this so the two numbers
   * don't disagree. */
  estimatedBudget?: number;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** "第 1 天（12/20 日）" for each day, so the model labels days with real
 * dates and weekdays instead of inventing them. */
function dayLabels(startDate: string, days: number): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000);
    return `第 ${i + 1} 天（${d.getUTCMonth() + 1}/${d.getUTCDate()} ${WEEKDAYS[d.getUTCDay()]}）`;
  });
}

/** Rescales a plan's budget lines so they add up to `target`, rounding each
 * to the nearest NT$100 and letting the largest line absorb the rounding
 * remainder. Skipped when the model's own total is already close, or so far
 * off (more than 2x either way) that scaling would be papering over a
 * genuinely wrong breakdown rather than fixing arithmetic drift. */
function fitBudgetToTarget(plan: TripPlan, target: number): void {
  const sum = totalBudget(plan);
  if (sum <= 0 || target <= 0) return;
  const ratio = target / sum;
  if (ratio < 0.5 || ratio > 2 || Math.abs(ratio - 1) < 0.005) return;

  for (const item of plan.budget) item.amount = Math.round((item.amount * ratio) / 100) * 100;
  const remainder = target - totalBudget(plan);
  const largest = plan.budget.reduce((a, b) => (b.amount > a.amount ? b : a), plan.budget[0]!);
  largest.amount = Math.max(0, largest.amount + remainder);
}

export async function generateTripDetail(
  req: TripDetailRequest,
  deadline: number = Date.now() + 55_000
): Promise<TripPlan> {
  const ai = getClient();
  const dayCount = tripDayCount(req.startDate, req.endDate);
  const budgetLine = req.estimatedBudget
    ? `旅客的目標預算約每人 ${formatTWD(req.estimatedBudget)}。`
    : "預算以中等舒適程度估算。";

  const place = `${req.destination}${req.country && req.country !== req.destination ? `（${req.country}）` : ""}`;
  const period = `${req.startDate} 到 ${req.endDate}`;
  const nights = dayCount - 1;
  // Roughly a third of a trip's budget goes to lodging, split between two
  // sharing a room — a nudge toward hotels in the right price tier, so the
  // hotels it finds and the "住宿" budget line can agree with each other.
  const lodgingHint =
    req.estimatedBudget && nights > 0
      ? `預算參考：每晚整間房大約 NT$${(Math.max(800, Math.round((req.estimatedBudget * 0.33 * 2) / nights / 100) * 100)).toLocaleString("en-US")} 上下。`
      : "";

  const { notes, sources } = await research(
    ai,
    [
      {
        label: "住宿",
        prompt: `請用 Google 搜尋，列出${place}在 ${period} 適合 2 人入住的 3 間住宿：真實店名、所在區域、每晚整間房大約價格（新台幣；外幣請換算）。${lodgingHint}`,
      },
      {
        label: "餐廳",
        prompt: `請用 Google 搜尋，列出${place}評價好、目前仍在營業的 6 間餐廳或小吃：店名、料理類型、人均消費（新台幣；外幣請換算）。`,
      },
      {
        label: "景點與體驗",
        prompt: `請用 Google 搜尋，列出${place}值得安排的 5 個景點或體驗：名稱與門票或費用（新台幣；外幣請換算）。`,
      },
      {
        label: "交通與注意事項",
        prompt: `請用 Google 搜尋，說明從台灣前往${place}的交通方式與大致費用（新台幣），以及 ${period} 期間當地的天氣、營業時間或活動等注意事項。`,
      },
    ],
    deadline
  );

  const parsed = await writeJson(
    ai,
    DETAIL_WRITE_MODEL,
    `根據下列研究筆記，為旅客「${req.destination}」${lengthText(req)}之旅（${req.startDate} 到 ${req.endDate}）寫出完整的旅行規劃。${budgetLine}

欄位要求：
- overview：行程總覽，2-3 句，點出這趟旅行的特色
- budget：每人預算拆分，項目固定為「交通」「住宿」「餐飲」「體驗」「其他」，amount 為新台幣整數，加總要等於${req.estimatedBudget ? ` ${req.estimatedBudget}` : "你估算的每人總預算"}。「住宿」要與 hotels 的價格互相一致：約等於中間價位那間的每晚房價 ÷ 2（兩人平分）× ${nights} 晚
- hotels：3 間住宿，pricePerNight 是整間房每晚的新台幣價格，note 說明位置與特色
- restaurants：6 間餐廳，pricePerPerson 是人均新台幣價格
- experiences：5 個體驗或景點，price 是新台幣費用（免費填 0）
- days：恰好 ${dayCount} 天，每天的 title 依序為：
${dayLabels(req.startDate, dayCount)
  .map((label) => `  ${label}：（寫出當天主題）`)
  .join("\n")}
  每天 3 到 5 個 items，每個 item 是一句話的具體安排；請把 hotels、restaurants、experiences 裡的店家與體驗合理排進各天（第一天與最後一天要考慮交通與抵達/離開）

${BUDGET_ASSUMPTIONS}
hotels、restaurants、experiences 只能使用研究筆記裡出現的店家與景點，不要自己編造新的。全部使用繁體中文。

研究筆記：
${notes}`,
    DETAIL_SCHEMA,
    16384,
    deadline
  );

  const plan = normalizeTripPlan(toTraditionalDeep(parsed));
  // Attached after the Traditional-Chinese pass on purpose — the converter
  // would happily "correct" characters inside a source's title or URL.
  plan.sources = sources;
  if (req.estimatedBudget) fitBudgetToTarget(plan, req.estimatedBudget);
  return plan;
}
