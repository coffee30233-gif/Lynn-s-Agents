"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMeetingLiveSession } from "@/hooks/useMeetingLiveSession";

export function LiveMeetingView() {
  const router = useRouter();
  const { status, errorMessage, liveTranscript, canFinish, connect, finish } = useMeetingLiveSession();
  const [title, setTitle] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveTranscript]);

  const isActive = status === "connecting" || status === "connected";
  const titleLocked = status !== "idle" && status !== "error";

  async function handleFinish() {
    const meetingId = await finish(title);
    if (meetingId) router.push(`/meetings/${meetingId}`);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-8 sm:py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">即時會議錄音 · Live</h1>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={titleLocked}
          placeholder="會議標題，例如：8月產品週會"
          className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none disabled:opacity-50"
        />

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center text-sm">
          {status === "idle" && <span className="text-white/40">準備好後點下方按鈕開始，全程請保持這個頁面開著、不要切走或鎖螢幕</span>}
          {status === "connecting" && <span className="text-white/40">連線中…</span>}
          {status === "connected" && <span className="font-medium text-emerald-300">● 錄音中</span>}
          {status === "finishing" && <span className="text-white/40">整理中…</span>}
          {status === "closed" && <span className="text-white/40">已結束，正在前往報告頁面</span>}
          {status === "error" && errorMessage && <span className="text-red-300">{errorMessage}</span>}
        </div>

        <p className="text-xs text-amber-300/80">
          ⚠️ 即時逐字稿不會分辨講者、僅供邊開會邊確認有在記錄——真正分講者的正式報告，是結束後用完整錄音跑一次分析才會產生，跟現在的畫面無關，請耐心等待。
        </p>

        {liveTranscript && (
          <div className="flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/80">{liveTranscript}</p>
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      <div className="safe-bottom flex flex-col items-center gap-2 border-t border-white/10 bg-ink-950/80 py-6 backdrop-blur-md">
        {status === "error" ? (
          <button
            type="button"
            onClick={canFinish ? handleFinish : connect}
            className="rounded-full bg-emerald-500 px-8 py-3 text-sm font-medium text-white shadow-lg transition-transform hover:bg-emerald-400 active:scale-95"
          >
            {canFinish ? "重試上傳" : "重新開始"}
          </button>
        ) : (
          <button
            type="button"
            onClick={isActive ? handleFinish : connect}
            disabled={status === "connecting" || status === "finishing" || status === "closed"}
            className={`flex h-20 w-20 items-center justify-center rounded-full text-sm font-medium text-white shadow-lg transition-transform active:scale-95 disabled:cursor-not-allowed ${
              status === "connected"
                ? "animate-pulse bg-red-500 hover:bg-red-400"
                : status === "connecting" || status === "finishing"
                  ? "bg-white/20"
                  : "bg-emerald-500 hover:bg-emerald-400"
            }`}
          >
            {status === "connected"
              ? "結束會議"
              : status === "connecting"
                ? "連線中…"
                : status === "finishing"
                  ? "處理中…"
                  : "開始錄音"}
          </button>
        )}
      </div>
    </div>
  );
}
