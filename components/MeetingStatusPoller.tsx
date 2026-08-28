"use client";

import { useEffect, useRef, useState } from "react";
import type { Meeting } from "@/lib/meetings/queries";
import { ExportMeetingWordButton } from "./ExportMeetingWordButton";
import { splitIntoSentenceLines } from "@/lib/meetings/splitSentences";
import { formatTaiwanDateTime } from "@/lib/date/format";

const POLL_INTERVAL_MS = 3000;
// A hard Vercel timeout kills the request mid-flight with no chance to run a
// catch block, so a genuinely stuck row just sits at "processing" forever
// with no error. Past this many ms since the last update, treat it as
// probably-stuck and automatically fire another process() call — segments
// are independent units of work (see process/route.ts), so re-processing
// just resumes at whatever segment/step segmentsDone says is next, it
// doesn't restart the whole recording. Caps out after a while so a
// genuinely broken segment doesn't retry forever silently.
const STUCK_AFTER_MS = 90_000;
const MAX_AUTO_RETRIES = 20;

export function MeetingStatusPoller({ initialMeeting }: { initialMeeting: Meeting }) {
  const [meeting, setMeeting] = useState(initialMeeting);
  const [retrying, setRetrying] = useState(false);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const retryInFlightRef = useRef(false);

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

  // Auto-retry a stuck (hard-killed) invocation instead of making the user
  // click every time — the ref guards against firing more than once for the
  // same stuck period while a retry is already in flight.
  useEffect(() => {
    if (!isStuck || retryInFlightRef.current || autoRetryCount >= MAX_AUTO_RETRIES) return;
    retryInFlightRef.current = true;
    setAutoRetryCount((c) => c + 1);
    handleRetry().finally(() => {
      retryInFlightRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStuck, meeting.id]);

  if (meeting.status === "uploaded" || (meeting.status === "processing" && !isStuck)) {
    const segmentProgress =
      meeting.totalSegments > 1
        ? meeting.segmentsDone < meeting.totalSegments
          ? `（逐字稿 ${meeting.segmentsDone}/${meeting.totalSegments} 段）`
          : "（逐字稿完成，整理摘要中）"
        : "";
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/70">
        處理中{segmentProgress}...這可能需要幾分鐘，取決於會議長度，可以先離開這頁，之後再回來查看。
      </div>
    );
  }

  if (meeting.status === "processing" && isStuck && autoRetryCount < MAX_AUTO_RETRIES) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/70">
        處理時間較長，自動重試中（第 {autoRetryCount} 次）...不需要手動操作。
      </div>
    );
  }

  if (meeting.status === "failed" || isStuck) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-5">
        <p className="text-sm text-red-300">
          {isStuck
            ? `自動重試 ${MAX_AUTO_RETRIES} 次後仍未完成，可能有更嚴重的問題。`
            : `處理失敗：${meeting.error ?? "未知錯誤"}`}
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

  return <MeetingReport meeting={meeting} />;
}

/** Plain-text rendering of the whole report, for the copy button — same
 * content and order as what's on screen. */
function reportAsText(meeting: Meeting): string {
  const header = [meeting.title, formatTaiwanDateTime(meeting.eventAt ?? meeting.createdAt)];
  if (meeting.attendees) header.push(`與會人員：${meeting.attendees}`);
  const parts = [header.join("\n")];
  if (meeting.summary) parts.push(`【重點摘要】\n${meeting.summary}`);
  if (meeting.chapters && meeting.chapters.length > 0) {
    parts.push(meeting.chapters.map((c, i) => `${i + 1}. ${c.title}\n${c.description}`).join("\n\n"));
  }
  if (meeting.actionItems && meeting.actionItems.length > 0) {
    parts.push(
      `【待辦事項】\n${meeting.actionItems.map((item) => `• ${item.text}${item.owner ? `（${item.owner}）` : ""}`).join("\n")}`
    );
  }
  if (meeting.notes) parts.push(`【其他注意事項】\n${meeting.notes}`);
  if (meeting.transcript) parts.push(`【完整逐字稿】\n${splitIntoSentenceLines(meeting.transcript).join("\n")}`);
  return parts.join("\n\n");
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied or unavailable — nothing useful to do
      // beyond just not showing the "已複製" confirmation.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:text-white"
    >
      {copied ? "已複製 ✓" : "📋 複製內容"}
    </button>
  );
}

function MeetingReport({ meeting }: { meeting: Meeting }) {
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <CopyButton getText={() => reportAsText(meeting)} />
        <ExportMeetingWordButton meeting={meeting} />
      </div>

      {meeting.summary && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="mb-2 text-sm font-semibold text-white">📋 重點摘要</p>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">{meeting.summary}</p>
        </div>
      )}

      {meeting.chapters && meeting.chapters.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <ol className="flex flex-col gap-2.5">
            {meeting.chapters.map((chapter, i) => (
              <li key={i} className="text-[15px] leading-relaxed">
                <span className="font-medium text-white/90">
                  {i + 1}. {chapter.title}
                </span>
                <p className="mt-0.5 text-sm text-white/60">{chapter.description}</p>
              </li>
            ))}
          </ol>
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

      {meeting.transcript && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="text-sm font-semibold text-white/70 hover:text-white"
          >
            {showTranscript ? "▾" : "▸"} 完整逐字稿
          </button>
          {showTranscript && (
            <div className="mt-3 flex flex-col gap-1.5">
              {splitIntoSentenceLines(meeting.transcript).map((line, i) => (
                <p key={i} className="text-sm leading-relaxed text-white/80">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
