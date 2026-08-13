"use client";

import { useState } from "react";
import type { PlaceResult } from "@/lib/places/googlePlaces";

export function PlacesLookup({ initialLocation }: { initialLocation?: string }) {
  const [location, setLocation] = useState(initialLocation ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [places, setPlaces] = useState<PlaceResult[] | null>(null);
  const [category, setCategory] = useState<"餐廳" | "停車場">("餐廳");

  async function handleQuery(kind: "餐廳" | "停車場") {
    if (!location.trim()) return;
    setCategory(kind);
    setStatus("loading");
    try {
      const query = `${location.trim()} 附近的${kind}`;
      const res = await fetch(`/api/places?query=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPlaces(data.places);
      setStatus("idle");
    } catch {
      setStatus("error");
      setPlaces(null);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-sm font-semibold text-white">📍 Google 地圖即時搜尋</p>
      <p className="mt-1 text-xs text-white/40">已驗證資料 · 依評分排序，可直接點進 Google 地圖</p>

      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="地點關鍵字，例如：淡水漁人碼頭"
        className="mt-3 w-full rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleQuery("餐廳")}
          disabled={!location.trim() || status === "loading"}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "loading" && category === "餐廳" ? "查詢中..." : "查詢餐廳"}
        </button>
        <button
          type="button"
          onClick={() => handleQuery("停車場")}
          disabled={!location.trim() || status === "loading"}
          className="rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-white transition-colors enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "loading" && category === "停車場" ? "查詢中..." : "查詢停車場"}
        </button>
      </div>

      {status === "error" && <p className="mt-2 text-xs text-red-300">查詢失敗，請再試一次</p>}

      {places && (
        <div className="mt-3 flex flex-col gap-2">
          {places.length === 0 && <p className="text-sm text-white/40">沒有找到結果</p>}
          {places.map((p, i) => (
            <a
              key={i}
              href={p.mapsUri}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{p.name}</p>
                <p className="truncate text-xs text-white/40">{p.address}</p>
              </div>
              {p.rating !== undefined && (
                <span className="shrink-0 text-xs text-amber-300">★ {p.rating}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
