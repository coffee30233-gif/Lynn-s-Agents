"use client";

import { useState } from "react";
import { TAIWAN_COUNTIES, type WeatherPeriod } from "@/lib/weather/cwa";

function formatPeriod(start: string, end: string): string {
  const fmt = (s: string) => {
    const d = new Date(s.replace(" ", "T"));
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:00`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export function WeatherLookup({ initialCounty }: { initialCounty?: string | null }) {
  const [county, setCounty] = useState(initialCounty ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [periods, setPeriods] = useState<WeatherPeriod[] | null>(null);

  async function handleQuery() {
    if (!county) return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/weather?county=${encodeURIComponent(county)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPeriods(data.periods);
      setStatus("idle");
    } catch {
      setStatus("error");
      setPeriods(null);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-sm font-semibold text-white">📡 中央氣象署即時天氣</p>
      <p className="mt-1 text-xs text-white/40">已驗證資料 · 僅涵蓋未來 36 小時內，縣市層級預報</p>

      <div className="mt-3 flex items-center gap-2">
        <select
          value={county}
          onChange={(e) => setCounty(e.target.value)}
          className="flex-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white focus:border-white/25 focus:outline-none"
        >
          <option value="" className="bg-ink-900">選擇縣市</option>
          {TAIWAN_COUNTIES.map((c) => (
            <option key={c} value={c} className="bg-ink-900">
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleQuery}
          disabled={!county || status === "loading"}
          className="shrink-0 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "loading" ? "查詢中..." : "查詢"}
        </button>
      </div>

      {status === "error" && <p className="mt-2 text-xs text-red-300">查詢失敗，請再試一次</p>}

      {periods && (
        <div className="mt-3 flex flex-col gap-2">
          {periods.map((p, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-xs text-white/40">{formatPeriod(p.start, p.end)}</p>
              <p className="text-sm text-white/90">
                {p.weather}，氣溫 {p.minTemp}~{p.maxTemp}°C，降雨機率 {p.rainChance}%
                {p.comfort ? `，${p.comfort}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
