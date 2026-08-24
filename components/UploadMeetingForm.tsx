"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function UploadMeetingForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !file || state === "uploading") return;

    setState("uploading");
    setError("");
    try {
      const fileExt = file.name.split(".").pop() ?? "";
      const createRes = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), fileExt }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || "建立會議紀錄失敗");

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("meeting-audio")
        .upload(created.audioPath, file, { contentType: file.type || undefined });
      if (uploadError) throw new Error(`上傳音檔失敗：${uploadError.message}`);

      // Fire-and-forget — this call itself can run close to the 60s cap, and
      // the detail page's own polling (against the DB row, not this
      // response) is what actually tracks progress. Not awaiting it here
      // just means the "上傳中" state ends as soon as the upload — the part
      // that can actually fail in a way the user needs to see — is done.
      fetch(`/api/meetings/${created.id}/process`, { method: "POST" }).catch(() => {});

      router.push(`/meetings/${created.id}`);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "發生未知錯誤");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
    >
      <p className="text-sm font-semibold text-white">上傳會議錄音 · Upload a recording</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="會議標題，例如：8月產品週會"
        className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-white/20"
      />
      <button
        type="submit"
        disabled={!title.trim() || !file || state === "uploading"}
        className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === "uploading" ? "上傳中..." : "上傳並開始處理"}
      </button>
      {state === "error" && <p className="text-sm text-red-300">{error}</p>}
      <p className="text-xs text-white/30">
        錄音檔不會即時處理——上傳後會在背景轉錄與整理，處理時間依會議長度而定，之後可以隨時回來查看進度與結果。
      </p>
    </form>
  );
}
