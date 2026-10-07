import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listTripsForUser } from "@/lib/trips/queries";
import { REGION_LABEL, formatDateRange, formatTWD, totalBudget, tripDayCount, tripLengthLabel } from "@/lib/trips/types";
import { TripPlannerFlow } from "@/components/TripPlannerFlow";

export default async function TripsPage() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  if (!supabaseConfigured) {
    return (
      <main className="safe-top flex min-h-dvh items-center justify-center bg-ink-950 px-6">
        <p className="text-sm text-white/40">
          Supabase 尚未設定，旅行規劃無法使用。 · Supabase isn&rsquo;t configured yet.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const trips = await listTripsForUser(supabase);

  return (
    <main className="safe-top min-h-dvh bg-ink-950">
      <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
        <div className="mb-10 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">旅行規劃 · Trips</h1>
          <Link href="/" className="text-sm text-white/40 transition-colors hover:text-white/80">
            ← Lynn&rsquo;s Agents
          </Link>
        </div>

        <TripPlannerFlow />

        {trips.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-3 text-sm font-semibold text-white/60">已選定的行程</h2>
            <div className="flex flex-col gap-3">
              {trips.map((trip) => (
                <Link
                  key={trip.id}
                  href={`/trips/${trip.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{trip.title}</p>
                    <p className="mt-1 text-xs text-white/30">
                      {formatDateRange(trip.startDate, trip.endDate)} ·{" "}
                      {tripLengthLabel(tripDayCount(trip.startDate, trip.endDate))} · {REGION_LABEL[trip.region]}
                    </p>
                  </div>
                  {totalBudget(trip.plan) > 0 && (
                    <span className="shrink-0 text-sm text-white/50">{formatTWD(totalBudget(trip.plan))}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
