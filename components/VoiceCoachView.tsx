"use client";

import { useEffect, useRef } from "react";
import type { CharacterProfile } from "@/types";
import { ChatHeader } from "./ChatHeader";
import { useLiveSession } from "@/hooks/useLiveSession";

export function VoiceCoachView({ character }: { character: CharacterProfile }) {
  const { status, errorMessage, transcript, connect, disconnect } = useLiveSession(character.id);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const isActive = status === "connecting" || status === "connected";

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <ChatHeader character={character} />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center text-sm">
          {status === "idle" && <span className="text-white/40">準備好後點下方按鈕開始</span>}
          {status === "connecting" && <span className="text-white/40">連線中…</span>}
          {status === "connected" && (
            <span className="font-medium text-emerald-300">● 對話中，直接開口說英文就可以</span>
          )}
          {status === "closed" && <span className="text-white/40">對話已結束</span>}
          {status === "error" && errorMessage && <span className="text-red-300">{errorMessage}</span>}
        </div>

        <p className="text-center text-xs text-amber-300/80">
          🎧 請戴耳機使用——用喇叭的話，教練的聲音幾乎一定會被麥克風收回去，導致誤判成你在打斷他、講到一半被切斷，或聲音聽起來忽快忽慢。
        </p>

        {transcript.length > 0 && (
          <div className="flex flex-col gap-2">
            {transcript.map((entry, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                  entry.role === "user"
                    ? "self-end rounded-br-sm bg-white text-ink-950"
                    : "self-start rounded-bl-sm border border-white/10 bg-white/[0.05] text-white/90"
                }`}
              >
                {entry.text}
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}

        {transcript.length === 0 && status === "idle" && (
          <p className="mt-4 text-center text-sm text-white/30">
            按下方按鈕開始，教練會先打招呼並問你今天想練什麼。
          </p>
        )}
      </div>

      <div className="safe-bottom flex flex-col items-center gap-2 border-t border-white/10 bg-ink-950/80 py-6 backdrop-blur-md">
        <button
          type="button"
          onClick={isActive ? disconnect : connect}
          disabled={status === "connecting"}
          className={`flex h-20 w-20 items-center justify-center rounded-full text-sm font-medium text-white shadow-lg transition-transform active:scale-95 disabled:cursor-not-allowed ${
            status === "connected"
              ? "animate-pulse bg-red-500 hover:bg-red-400"
              : status === "connecting"
                ? "bg-white/20"
                : "bg-emerald-500 hover:bg-emerald-400"
          }`}
        >
          {status === "connected" ? "結束對話" : status === "connecting" ? "連線中…" : "開始對話"}
        </button>
      </div>
    </div>
  );
}
