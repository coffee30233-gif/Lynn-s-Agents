"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EditPlanButton({
  planId,
  initialTitle,
  initialLocation,
  initialEventDate,
}: {
  planId: string;
  initialTitle: string;
  initialLocation: string | null;
  initialEventDate: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [location, setLocation] = useState(initialLocation ?? "");
  const [eventDate, setEventDate] = useState(initialEventDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-white/30 transition-colors hover:text-white/70"
      >
        編輯行程
      </button>
    );
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), location: location.trim(), eventDate }),
      });
      if (!res.ok) throw new Error();
      setEditing(false);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="行程標題"
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
          disabled={!title.trim() || saving}
          className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "儲存中..." : "確認"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-white/40 hover:text-white/70"
        >
          取消
        </button>
        {error && <span className="text-xs text-red-300">儲存失敗，請再試一次</span>}
      </div>
    </div>
  );
}
