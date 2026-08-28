import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMeeting } from "@/lib/meetings/queries";
import { MeetingStatusPoller } from "@/components/MeetingStatusPoller";
import { DeleteMeetingButton } from "@/components/DeleteMeetingButton";
import { formatTaiwanDateTime } from "@/lib/date/format";

export default async function MeetingDetailPage({ params }: { params: { meetingId: string } }) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseConfigured) notFound();

  const supabase = await createClient();
  const meeting = await getMeeting(supabase, params.meetingId);
  if (!meeting) notFound();

  return (
    <main className="safe-top min-h-dvh bg-ink-950">
      <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/meetings" className="text-sm text-white/40 transition-colors hover:text-white/80">
            ← 會議助理 · Meetings
          </Link>
          <DeleteMeetingButton meetingId={meeting.id} />
        </div>

        <h1 className="text-2xl font-bold text-white">{meeting.title}</h1>
        <p className="mt-1 text-xs text-white/30">
          {formatTaiwanDateTime(meeting.eventAt ?? meeting.createdAt)}
        </p>
        {meeting.attendees && <p className="mt-0.5 text-xs text-white/30">與會人員：{meeting.attendees}</p>}

        <div className="mt-6">
          <MeetingStatusPoller initialMeeting={meeting} />
        </div>
      </div>
    </main>
  );
}
