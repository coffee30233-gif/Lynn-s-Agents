"use client";

import { useState } from "react";
import Link from "next/link";
import type { Source } from "@/types";
import {
  cleanPlanContent,
  suggestPlanTitle,
  suggestPlanLocation,
  suggestPlanDate,
} from "@/lib/text/parseItinerary";

export function SavePlanButton({
  content,
  sources,
  conversationId,
}: {
  content: string;
  sources?: Source[];
  conversationId?: string;
}) {
  const [state, setState] = useState<"idle" | "form" | "saving" | "saved" | "error">("idle");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [eventDate, setEventDate] = useState("");

  async function handleSave() {
    if (!title.trim()) return;
    setState("saving");
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          location: location.trim(),
          eventDate,
          content: cleanPlanContent(content),
          sources,
          conversationId,
        }),
      });
      if (!res.ok) throw new Error();
      setState("saved");
    } catch {
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => {
          setTitle(suggestPlanTitle(content));
          setLocation(suggestPlanLocation(content));
          setEventDate(suggestPlanDate(content));
          setState("form");
        }}
        className="mt-1.5 text-xs text-white/30 transition-colors hover:text-white/70"
      >
        儲存為行程 · Save as plan
      </button>
    );
  }

  if (state === "saved") {
    return (
      <p className="mt-1.5 text-xs text-white/40">
        已儲存 ✓ <Link href="/plans" className="underline hover:text-white/70">查看行程</Link>
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="行程標題，例如：週末台南行"
        className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
      />
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="地點關鍵字（選填，用來產生地圖連結）"
        className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
      />
      <input
        type="date"
        value={eventDate}
        onChange={(e) => setEventDate(e.target.value)}
        className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none [color-scheme:dark]"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!title.trim() || state === "saving"}
          className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state === "saving" ? "儲存中..." : "確認儲存"}
        </button>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="text-xs text-white/40 hover:text-white/70"
        >
          取消
        </button>
        {state === "error" && <span className="text-xs text-red-300">儲存失敗，請再試一次</span>}
      </div>
    </div>
  );
}
