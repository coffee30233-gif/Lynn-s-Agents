"use client";

import { useEffect, useRef, useState } from "react";
import type { Meeting } from "@/lib/meetings/queries";

const POLL_INTERVAL_MS = 3000;
// A hard Vercel timeout kills the request mid-flight with no chance to run a
// catch block, so a genuinely stuck row just sits at "processing" forever
// with no error. Past this many ms since the last update, treat it as
// probably-stuck and offer a retry instead of polling forever.
const STUCK_AFTER_MS = 90_000;

export function MeetingStatusPoller({ initialMeeting }: { initialMeeting: Meeting }) {
  const [meeting, setMeeting] = useState(initialMeeting);
  const [retrying, setRetrying] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (meeting.status !== "uploaded" && meeting.status !== "processing") return;

    const interval = setInterval(async () => {
      setNow(Date.now());
      try {
        const res = await fetch(`/api/meetings/${meeting.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.meeting) setMeeting(data.meeting);
      } catch {
        // Network hiccup — next tick will retry, no need to surface this.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [meeting.status, meeting.id]);

  async function handleRetry() {
    setRetrying(true);
    try {
      await fetch(`/api/meetings/${meeting.id}/process`, { method: "POST" });
      const res = await fetch(`/api/meetings/${meeting.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.meeting) setMeeting(data.meeting);
      }
    } finally {
      setRetrying(false);
    }
  }

  const isStuck =
    meeting.status === "processing" && now - new Date(meeting.updatedAt).getTime() > STUCK_AFTER_MS;

  if (meeting.status === "uploaded" || (meeting.status === "processing" && !isStuck)) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/70">
        處理中...這可能需要幾分鐘，取決於會議長度，可以先離開這頁，之後再回來查看。
      </div>
    );
  }

  if (meeting.status === "failed" || isStuck) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-5">
        <p className="text-sm text-red-300">
          {isStuck ? "處理時間較長，可能已經中斷了。" : `處理失敗：${meeting.error ?? "未知錯誤"}`}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="self-start rounded-lg border border-white/15 px-3.5 py-1.5 text-xs font-medium text-white transition-opacity enabled:hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {retrying ? "重試中..." : "重試"}
        </button>
      </div>
    );
  }

  return <MeetingReport meeting={meeting} onMeetingChange={setMeeting} />;
}

function MeetingReport({ meeting, onMeetingChange }: { meeting: Meeting; onMeetingChange: (m: Meeting) => void }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [speakerDrafts, setSpeakerDrafts] = useState<Record<string, string>>({});
  const [savingSpeakers, setSavingSpeakers] = useState(false);
  const [speakerError, setSpeakerError] = useState("");

  const uniqueSpeakers = Array.from(new Set((meeting.transcript ?? []).map((seg) => seg.speaker)));

  function draftFor(speaker: string): string {
    return speakerDrafts[speaker] ?? speaker;
  }

  const hasRenames = uniqueSpeakers.some((s) => draftFor(s).trim() && draftFor(s).trim() !== s);

  async function handleSaveSpeakerNames() {
    if (!meeting.transcript || !hasRenames) return;
    setSavingSpeakers(true);
    setSpeakerError("");
    try {
      const renames = new Map(
        uniqueSpeakers
          .map((s) => [s, draftFor(s).trim()] as const)
          .filter(([from, to]) => to && to !== from)
      );
      const updatedTranscript = meeting.transcript.map((seg) => ({
        ...seg,
        speaker: renames.get(seg.speaker) ?? seg.speaker,
      }));

      const res = await fetch(`/api/meetings/${meeting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: updatedTranscript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存失敗");

      onMeetingChange({ ...meeting, transcript: updatedTranscript });
      setSpeakerDrafts({});
    } catch (err) {
      setSpeakerError(err instanceof Error ? err.message : "發生未知錯誤");
    } finally {
      setSavingSpeakers(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {meeting.summary && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="mb-2 text-sm font-semibold text-white">📋 重點摘要</p>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">{meeting.summary}</p>
        </div>
      )}

      {meeting.actionItems && meeting.actionItems.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="mb-2 text-sm font-semibold text-white">✅ 待辦事項</p>
          <ul className="flex flex-col gap-1.5">
            {meeting.actionItems.map((item, i) => (
              <li key={i} className="text-[15px] leading-relaxed text-white/90">
                • {item.text}
                {item.owner && <span className="text-white/40"> — {item.owner}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {meeting.notes && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="mb-2 text-sm font-semibold text-white">📝 其他注意事項</p>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">{meeting.notes}</p>
        </div>
      )}

      {meeting.transcript && meeting.transcript.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="text-sm font-semibold text-white/70 hover:text-white"
          >
            {showTranscript ? "▾" : "▸"} 完整逐字稿 · 語者標記為機器判斷，可能不完全準確
          </button>
          {showTranscript && (
            <>
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs text-white/40">修改講者名稱（例如把「Speaker A」改成真實姓名），會套用到整份逐字稿：</p>
                <div className="flex flex-col gap-1.5">
                  {uniqueSpeakers.map((speaker) => (
                    <div key={speaker} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 truncate text-xs text-white/40">{speaker}</span>
                      <input
                        value={draftFor(speaker)}
                        onChange={(e) => setSpeakerDrafts((prev) => ({ ...prev, [speaker]: e.target.value }))}
                        className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white focus:border-white/25 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleSaveSpeakerNames}
                  disabled={!hasRenames || savingSpeakers}
                  className="self-start rounded-lg border border-white/15 px-3 py-1 text-xs font-medium text-white transition-opacity enabled:hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingSpeakers ? "儲存中..." : "儲存講者名稱"}
                </button>
                {speakerError && <p className="text-xs text-red-300">{speakerError}</p>}
              </div>

              <div className="mt-3 flex flex-col gap-2.5">
                {meeting.transcript.map((seg, i) => (
                  <p key={i} className="text-sm leading-relaxed text-white/80">
                    <span className="font-medium text-white/50">{seg.speaker}：</span>
                    {seg.text}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
