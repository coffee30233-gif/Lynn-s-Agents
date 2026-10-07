import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTrip } from "@/lib/trips/queries";
import { TripDetail } from "@/components/TripDetail";
import { DeleteTripButton } from "@/components/DeleteTripButton";

export default async function TripDetailPage({ params }: { params: { tripId: string } }) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseConfigured) notFound();

  const supabase = await createClient();
  const trip = await getTrip(supabase, params.tripId);
  if (!trip) notFound();

  return (
    <main className="safe-top min-h-dvh bg-ink-950">
      <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/trips" className="text-sm text-white/40 transition-colors hover:text-white/80">
            ← 旅行規劃 · Trips
          </Link>
          <DeleteTripButton tripId={trip.id} />
        </div>

        <TripDetail trip={trip} />
      </div>
    </main>
  );
}
