"use client";

import { useState } from "react";
import type { Meeting } from "@/lib/meetings/queries";

type SectionKey = "summary" | "chapters" | "actionItems" | "transcript";

const SECTION_LABELS: Record<SectionKey, string> = {
  summary: "會議摘要",
  chapters: "章節",
  actionItems: "待辦事項",
  transcript: "逐字稿",
};

/** Which sections a meeting actually has content for — lets the checkboxes
 * only offer choices that would produce something, and drives the default
 * selection (everything available except the long transcript). */
function availableSections(meeting: Meeting): SectionKey[] {
  const keys: SectionKey[] = [];
  if (meeting.summary) keys.push("summary");
  if (meeting.chapters && meeting.chapters.length > 0) keys.push("chapters");
  if (meeting.actionItems && meeting.actionItems.length > 0) keys.push("actionItems");
  if (meeting.transcript) keys.push("transcript");
  return keys;
}

async function buildAndDownloadDocx(meeting: Meeting, selected: Set<SectionKey>) {
  // Loaded on demand — docx's bundle is sizeable and most page loads never
  // click this button.
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: meeting.title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: new Date(meeting.createdAt).toLocaleString("zh-Hant-TW"), color: "888888" })],
    }),
  ];

  if (selected.has("summary") && meeting.summary) {
    children.push(new Paragraph({ text: "會議摘要", heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ text: meeting.summary }));
  }

  if (selected.has("chapters") && meeting.chapters) {
    children.push(new Paragraph({ text: "章節", heading: HeadingLevel.HEADING_1 }));
    meeting.chapters.forEach((chapter, i) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${chapter.title}`, bold: true })],
        })
      );
      children.push(new Paragraph({ text: chapter.description }));
    });
  }

  if (selected.has("actionItems") && meeting.actionItems) {
    children.push(new Paragraph({ text: "待辦事項", heading: HeadingLevel.HEADING_1 }));
    meeting.actionItems.forEach((item) => {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun(item.text),
            ...(item.owner ? [new TextRun({ text: `（${item.owner}）`, color: "888888" })] : []),
          ],
        })
      );
    });
  }

  if (selected.has("transcript") && meeting.transcript) {
    children.push(new Paragraph({ text: "逐字稿", heading: HeadingLevel.HEADING_1 }));
    // One Word paragraph per blank-line-separated chunk (segment boundaries
    // from appendSegmentTranscript) reads better than one giant paragraph.
    for (const chunk of meeting.transcript.split(/\n\n+/)) {
      children.push(new Paragraph({ text: chunk }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meeting.title}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportMeetingWordButton({ meeting }: { meeting: Meeting }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const available = availableSections(meeting);
  const [selected, setSelected] = useState<Set<SectionKey>>(
    () => new Set(available.filter((k) => k !== "transcript"))
  );

  if (available.length === 0) return null;

  function toggle(key: SectionKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleExport() {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      await buildAndDownloadDocx(meeting, selected);
      setOpen(false);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:text-white"
      >
        📄 匯出 Word
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-56 rounded-xl border border-white/10 bg-ink-950 p-3 shadow-xl">
          <p className="mb-2 text-xs text-white/40">選擇要包含的內容：</p>
          <div className="flex flex-col gap-1.5">
            {available.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
                {SECTION_LABELS[key]}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={selected.size === 0 || exporting}
            className="mt-3 w-full rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? "產生中..." : "下載 .docx"}
          </button>
        </div>
      )}
    </div>
  );
}
