import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listMeetingsForUser } from "@/lib/meetings/queries";
import { UploadMeetingForm } from "@/components/UploadMeetingForm";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "等待處理",
  processing: "處理中",
  done: "已完成",
  failed: "失敗",
};

export default async function MeetingsPage() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  if (!supabaseConfigured) {
    return (
      <main className="safe-top flex min-h-dvh items-center justify-center bg-ink-950 px-6">
        <p className="text-sm text-white/40">
          Supabase 尚未設定，會議助理無法使用。 · Supabase isn&rsquo;t configured yet.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const meetings = await listMeetingsForUser(supabase);

  return (
    <main className="safe-top min-h-dvh bg-ink-950">
      <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
        <div className="mb-10 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">會議助理 · Meetings</h1>
          <Link href="/" className="text-sm text-white/40 transition-colors hover:text-white/80">
            ← Lynn&rsquo;s Agents
          </Link>
        </div>

        <UploadMeetingForm />

        <Link
          href="/meetings/live"
          className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
        >
          🎙️ 開始即時會議錄音 · Start a live recording
        </Link>

        <div className="mt-8 flex flex-col gap-3">
          {meetings.length === 0 && (
            <p className="text-sm text-white/30">還沒有上傳任何會議錄音。</p>
          )}
          {meetings.map((meeting) => (
            <Link
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]"
            >
              <div>
                <p className="text-sm font-medium text-white">{meeting.title}</p>
                <p className="mt-1 text-xs text-white/30">
                  {new Date(meeting.createdAt).toLocaleString("zh-Hant-TW")}
                </p>
              </div>
              <span className="text-xs text-white/50">{STATUS_LABEL[meeting.status] ?? meeting.status}</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
