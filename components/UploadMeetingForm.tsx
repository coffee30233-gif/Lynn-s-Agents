"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MAX_MEETING_AUDIO_BYTES } from "@/lib/meetings/constants";
import { uploadMeetingAudioChunked } from "@/lib/meetings/chunkedUpload";
import { splitAudioIntoSegments } from "@/lib/meetings/audioSplit";
import { segmentFolderName } from "@/lib/meetings/segmentPath";

/** "YYYY-MM-DDTHH:mm" in the browser's local time, for <input
 * type="datetime-local">'s default value — that input has no timezone
 * concept of its own, so pre-filling with new Date().toISOString() (UTC)
 * would show the wrong local time. */
function nowForDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function UploadMeetingForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [eventAt, setEventAt] = useState(() => nowForDatetimeLocal());
  const [attendees, setAttendees] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "splitting" | "uploading" | "error">("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_MEETING_AUDIO_BYTES) {
      setFile(null);
      setState("error");
      setError(
        `檔案有 ${(selected.size / 1024 / 1024).toFixed(0)}MB，超過 ${MAX_MEETING_AUDIO_BYTES / 1024 / 1024}MB 上限，請試試壓縮錄音品質。`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(selected);
    setState("idle");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !file || state === "splitting" || state === "uploading") return;

    setError("");
    try {
      // Split into ~10-minute WAV segments up front — each gets transcribed
      // by its own Gemini call with its own fresh 60s budget server-side
      // (see app/api/meetings/[meetingId]/process/route.ts). A short
      // recording just becomes a single segment, same path either way.
      setState("splitting");
      const segments = await splitAudioIntoSegments(file);

      setState("uploading");
      const createRes = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          fileExt: "wav",
          totalSegments: segments.length,
          eventAt: eventAt ? new Date(eventAt).toISOString() : undefined,
          attendees: attendees.trim() || undefined,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || "建立會議紀錄失敗");

      const supabase = createClient();
      for (let i = 0; i < segments.length; i++) {
        setProgress(segments.length > 1 ? `上傳中（${i + 1}/${segments.length} 段）` : "上傳中...");
        await uploadMeetingAudioChunked(supabase, `${created.audioPath}/${segmentFolderName(i)}`, "wav", segments[i]!);
      }

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

  const busy = state === "splitting" || state === "uploading";

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
        type="datetime-local"
        value={eventAt}
        onChange={(e) => setEventAt(e.target.value)}
        className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white focus:border-white/25 focus:outline-none [color-scheme:dark]"
      />
      <input
        value={attendees}
        onChange={(e) => setAttendees(e.target.value)}
        placeholder="與會人員（選填），例如：Lynn、John、Mary"
        className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-white/20"
      />
      <button
        type="submit"
        disabled={!title.trim() || !file || busy}
        className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === "splitting" ? "處理錄音中..." : state === "uploading" ? progress || "上傳中..." : "上傳並開始處理"}
      </button>
      {state === "error" && <p className="text-sm text-red-300">{error}</p>}
      <p className="text-xs text-white/30">
        大檔案會自動分段上傳，不受單檔 50MB 限制。上傳後會在背景轉錄與整理，處理時間依會議長度而定，之後可以隨時回來查看進度與結果。
      </p>
    </form>
  );
}
