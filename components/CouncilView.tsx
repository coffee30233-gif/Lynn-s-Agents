"use client";

import Image from "next/image";
import { useState } from "react";
import type { CharacterProfile, CouncilResponseBody } from "@/types";
import { CouncilResults } from "./CouncilResults";

export function CouncilView({ characters }: { characters: CharacterProfile[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [result, setResult] = useState<CouncilResponseBody | null>(null);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (selectedIds.size < 2 || !question.trim() || status === "loading") return;
    setStatus("loading");
    setResult(null);

    try {
      const res = await fetch("/api/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterIds: Array.from(selectedIds), message: question.trim() }),
      });
      if (!res.ok) throw new Error(`Request failed with ${res.status}`);
      const data: CouncilResponseBody = await res.json();
      setResult(data);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  if (result) {
    const panel = result.responses.map((r) => ({
      character: characters.find((c) => c.id === r.characterId)!,
      message: r.message,
    }));

    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <CouncilResults question={question} panel={panel} synthesis={result.synthesis} />
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setQuestion("");
          }}
          className="mt-8 text-sm text-white/40 transition-colors hover:text-white/80"
        >
          ← 問新的問題 · Ask another question
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="mb-4 text-sm text-white/50">選至少 2 位人物 · Select at least 2 characters</p>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {characters.map((character) => {
          const selected = selectedIds.has(character.id);
          return (
            <button
              key={character.id}
              type="button"
              onClick={() => toggle(character.id)}
              className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${
                selected
                  ? "border-white/60 bg-white/[0.08]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/25"
              }`}
            >
              <div className="relative h-12 w-12 overflow-hidden rounded-full ring-1 ring-white/15">
                <Image src={character.avatar} alt={character.displayName} fill className="object-cover" />
              </div>
              <span className="text-center text-xs font-medium text-white/80">
                {character.displayName}
              </span>
            </button>
          );
        })}
      </div>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="我想創業，但不知道從哪開始。你們怎麼看？"
        rows={3}
        className="mt-6 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={selectedIds.size < 2 || !question.trim() || status === "loading"}
        className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {status === "loading" ? "Council 正在討論中... Council is deliberating..." : "問問 Council · Ask the Council"}
      </button>

      {status === "error" && (
        <p className="mt-3 text-center text-sm text-red-300">
          發生錯誤，請再試一次 · Something went wrong, please try again.
        </p>
      )}
    </div>
  );
}
