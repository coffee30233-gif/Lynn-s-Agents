import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listPlansForUser, hasGoogleCalendarConnected } from "@/lib/plans/queries";
import { PlansCalendar } from "@/components/PlansCalendar";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: { calendar_connected?: string; calendar_error?: string };
}) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  if (!supabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-950 px-6">
        <p className="text-sm text-white/40">
          Supabase 尚未設定，行程功能無法使用。 · Supabase isn&rsquo;t configured yet.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const plans = await listPlansForUser(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const calendarConnected = user ? await hasGoogleCalendarConnected(supabase, user.id) : false;

  return (
    <main className="min-h-screen bg-ink-950">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">我的行程 · Plans</h1>
          <Link href="/" className="text-sm text-white/40 transition-colors hover:text-white/80">
            ← Lynn&rsquo;s Agents
          </Link>
        </div>

        {searchParams.calendar_connected && (
          <p className="mb-6 text-sm text-emerald-300/90">
            ✓ 已連接 Google 行事曆，之後可以在行程頁面把行程加入行事曆。
          </p>
        )}
        {searchParams.calendar_error && (
          <p className="mb-6 text-sm text-red-300/90">連接 Google 行事曆失敗，請再試一次。</p>
        )}

        {!calendarConnected && (
          <a
            href="/api/google-calendar/connect"
            className="mb-6 inline-block text-sm text-white/40 underline decoration-white/20 underline-offset-2 transition-colors hover:text-white/80"
          >
            連接 Google 行事曆 · Connect Google Calendar
          </a>
        )}

        <PlansCalendar plans={plans} />
      </div>
    </main>
  );
}
