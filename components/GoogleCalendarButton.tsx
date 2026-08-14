"use client";

import { useState } from "react";

export function GoogleCalendarButton({
  planId,
  connected,
  initialSynced,
}: {
  planId: string;
  connected: boolean;
  initialSynced: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    initialSynced ? "done" : "idle"
  );

  if (!connected) {
    return (
      <a
        href="/api/google-calendar/connect"
        className="mt-2 inline-block text-xs text-white/30 underline decoration-white/20 underline-offset-2 transition-colors hover:text-white/70"
      >
        連接 Google 行事曆才能加入 · Connect Google Calendar
      </a>
    );
  }

  async function handleClick() {
    setStatus("loading");
    try {
      const res = await fetch(`/api/plans/${planId}/calendar`, { method: "POST" });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        className="text-xs text-white/30 transition-colors hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {status === "done"
          ? "已加入 Google 行事曆 ✓ · 重新同步"
          : status === "loading"
            ? "加入中..."
            : "加入 Google 行事曆 · Add to Google Calendar"}
      </button>
      {status === "error" && <span className="text-xs text-red-300">失敗，請再試一次</span>}
    </div>
  );
}
