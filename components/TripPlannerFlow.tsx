"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TripPlanView } from "./TripPlanView";
import {
  MAX_TRIP_DAYS,
  REGION_HINT,
  REGION_LABEL,
  TRIP_REGIONS,
  formatDateRange,
  formatTWD,
  todayInTaiwan,
  tripDayCount,
  tripLengthLabel,
  validateTripRequest,
  type TripPlan,
  type TripRegion,
  type TripSuggestion,
} from "@/lib/trips/types";

type Step = "form" | "suggestions" | "detail";
type Busy = null | "suggest" | "detail" | "save";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // A Vercel timeout answers with plain text, not our JSON error body.
    const fallback = res.status === 504 ? "產生行程花的時間太久了，請再試一次" : "發生未知錯誤，請再試一次";
    throw new Error(data?.error || fallback);
  }
  return data as T;
}

const inputClass =
  "rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white focus:border-white/25 focus:outline-none [color-scheme:dark]";

function Spinner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-cyan-300" />
      <span>{children}</span>
    </div>
  );
}

export function TripPlannerFlow() {
  const router = useRouter();
  const [today] = useState(() => todayInTaiwan());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [region, setRegion] = useState<TripRegion | null>(null);

  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<TripSuggestion[]>([]);
  const [selected, setSelected] = useState<TripSuggestion | null>(null);
  const [plan, setPlan] = useState<TripPlan | null>(null);

  // The conditions the current suggestions were generated for. The form
  // inputs stay editable after submitting, so detail/save requests must use
  // these, not whatever the inputs say by now.
  const [submitted, setSubmitted] = useState<{ startDate: string; endDate: string; region: TripRegion } | null>(
    null
  );
  // Reopening a destination you already looked at shouldn't cost another
  // ~30s generation — keyed by destination, cleared whenever a fresh set of
  // suggestions is fetched.
  const planCache = useRef(new Map<string, TripPlan>());

  const days = tripDayCount(startDate, endDate);

  /** `excludeShown` is "換一批": ask for five different destinations than the
   * ones currently on screen. */
  async function fetchSuggestions(excludeShown = false) {
    const invalid = validateTripRequest({ startDate, endDate, region });
    if (invalid || !region) {
      setError(invalid ?? "請選擇國內、國外或離島");
      return;
    }
    setError("");
    setBusy("suggest");
    try {
      const data = await postJson<{ suggestions: TripSuggestion[] }>("/api/trips/suggest", {
        startDate,
        endDate,
        region,
        exclude: excludeShown ? suggestions.map((s) => s.destination) : undefined,
      });
      planCache.current.clear();
      setSubmitted({ startDate, endDate, region });
      setSuggestions(data.suggestions);
      setStep("suggestions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生未知錯誤，請再試一次");
    } finally {
      setBusy(null);
    }
  }

  async function openDetail(suggestion: TripSuggestion) {
    if (!submitted) return;
    setError("");
    setSelected(suggestion);

    const cached = planCache.current.get(suggestion.destination);
    if (cached) {
      setPlan(cached);
      setStep("detail");
      return;
    }

    setBusy("detail");
    try {
      const data = await postJson<{ plan: TripPlan }>("/api/trips/detail", {
        ...submitted,
        destination: suggestion.destination,
        country: suggestion.country,
        estimatedBudget: suggestion.estimatedBudget || undefined,
      });
      planCache.current.set(suggestion.destination, data.plan);
      setPlan(data.plan);
      setStep("detail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生未知錯誤，請再試一次");
    } finally {
      setBusy(null);
    }
  }

  async function saveSelection() {
    if (!submitted || !selected || !plan) return;
    setError("");
    setBusy("save");
    try {
      const data = await postJson<{ id: string }>("/api/trips", {
        ...submitted,
        destination: selected.destination,
        country: selected.country,
        plan,
      });
      router.push(`/trips/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生未知錯誤，請再試一次");
      setBusy(null);
    }
  }

  const errorLine = error && <p className="text-sm text-red-300">{error}</p>;

  // ── Step 3: one destination's full plan ────────────────────────────────
  if (step === "detail" && selected && plan && submitted) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => {
            setError("");
            setStep("suggestions");
          }}
          className="self-start text-sm text-white/40 transition-colors hover:text-white/80"
        >
          ← 回到推薦清單
        </button>

        <div>
          <h2 className="text-2xl font-bold text-white">
            {selected.destination}
            {selected.country && selected.country !== selected.destination && (
              <span className="ml-2 text-base font-normal text-white/40">{selected.country}</span>
            )}
          </h2>
          <p className="mt-1 text-xs text-white/40">
            {formatDateRange(submitted.startDate, submitted.endDate)} ·{" "}
            {tripLengthLabel(tripDayCount(submitted.startDate, submitted.endDate))} · {REGION_LABEL[submitted.region]}
          </p>
        </div>

        <TripPlanView plan={plan} />

        <div className="sticky bottom-0 -mx-6 flex flex-col gap-2 border-t border-white/10 bg-ink-950/90 px-6 py-4 backdrop-blur-md">
          {errorLine}
          <button
            type="button"
            onClick={saveSelection}
            disabled={busy === "save"}
            className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "save" ? "儲存中..." : "✓ 選定這個行程，開始編輯"}
          </button>
          <p className="text-center text-xs text-white/30">選定後可以自由修改所有內容</p>
        </div>
      </div>
    );
  }

  // ── Step 2: the top five ───────────────────────────────────────────────
  if (step === "suggestions" && submitted) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep("form");
            }}
            disabled={busy !== null}
            className="text-sm text-white/40 transition-colors enabled:hover:text-white/80 disabled:opacity-40"
          >
            ← 修改條件
          </button>
          <button
            type="button"
            onClick={() => void fetchSuggestions(true)}
            disabled={busy !== null}
            className="text-sm text-white/40 transition-colors enabled:hover:text-white/80 disabled:opacity-40"
          >
            🔄 換一批
          </button>
        </div>

        <p className="text-sm text-white/50">
          {formatDateRange(submitted.startDate, submitted.endDate)} ·{" "}
          {tripLengthLabel(tripDayCount(submitted.startDate, submitted.endDate))} · {REGION_LABEL[submitted.region]}
          ，推薦前五名：
        </p>

        {busy === "suggest" && <Spinner>重新搜尋推薦中...（約 15 秒）</Spinner>}
        {busy === "detail" && (
          <Spinner>
            正在搜尋 {selected?.destination} 的最新資訊並規劃行程...（約 30–40 秒，請不要離開這頁）
          </Spinner>
        )}
        {errorLine}

        <ol className="flex flex-col gap-3">
          {suggestions.map((s, i) => (
            <li key={s.destination}>
              <button
                type="button"
                onClick={() => openDetail(s)}
                disabled={busy !== null}
                className="flex w-full gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors enabled:hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-bold text-cyan-300">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-lg font-semibold text-white">
                      {s.destination}
                      {s.country && s.country !== s.destination && (
                        <span className="ml-2 text-sm font-normal text-white/40">{s.country}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-base font-semibold text-cyan-300">
                        {s.estimatedBudget > 0 ? formatTWD(s.estimatedBudget) : "預算未提供"}
                      </span>
                      <span className="block text-[11px] text-white/30">每人預估</span>
                    </span>
                  </span>
                  <span className="text-sm text-white/80">{s.tagline}</span>
                  <span className="text-sm leading-relaxed text-white/50">{s.reason}</span>
                  {s.budgetNote && <span className="text-xs text-white/30">{s.budgetNote}</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="text-xs text-white/30">點進任一目的地，查看飯店、餐廳、體驗與每日行程。</p>
      </div>
    );
  }

  // ── Step 1: dates + region ─────────────────────────────────────────────
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void fetchSuggestions();
      }}
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
    >
      <p className="text-sm font-semibold text-white">規劃新旅程 · Plan a trip</p>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs text-white/50">
          出發日期
          <input
            type="date"
            value={startDate}
            min={today}
            onChange={(e) => {
              setStartDate(e.target.value);
              // Keep the range valid instead of silently leaving 回程 earlier than 出發.
              if (endDate && e.target.value > endDate) setEndDate(e.target.value);
            }}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-white/50">
          回程日期
          <input
            type="date"
            value={endDate}
            min={startDate || today}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {days > 0 && (
        <p className={`-mt-2 text-xs ${days > MAX_TRIP_DAYS ? "text-red-300" : "text-white/40"}`}>
          {tripLengthLabel(days)}
          {days > MAX_TRIP_DAYS && `（最多 ${MAX_TRIP_DAYS} 天）`}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs text-white/50">想去哪裡？</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="旅遊地區">
          {TRIP_REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={region === r}
              onClick={() => setRegion(r)}
              className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                region === r
                  ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-200"
                  : "border-white/10 bg-white/[0.04] text-white/70 hover:border-white/25"
              }`}
            >
              {REGION_LABEL[r]}
            </button>
          ))}
        </div>
        {region && <p className="text-xs text-white/30">{REGION_HINT[region]}</p>}
      </div>

      {busy === "suggest" && <Spinner>正在搜尋最新資訊並整理推薦...（約 15 秒）</Spinner>}
      {errorLine}

      <button
        type="submit"
        disabled={!startDate || !endDate || !region || busy !== null}
        className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy === "suggest" ? "搜尋中..." : "幫我找前五名推薦"}
      </button>
      <p className="text-xs text-white/30">
        預算為每人估算（新台幣，含來回交通、住宿、餐飲與基本體驗），從台灣出發計算。
      </p>
    </form>
  );
}
