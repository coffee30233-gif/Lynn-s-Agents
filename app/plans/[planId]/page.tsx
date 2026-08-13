import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/plans/queries";
import { DeletePlanButton } from "@/components/DeletePlanButton";

function googleMapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export default async function PlanDetailPage({ params }: { params: { planId: string } }) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseConfigured) notFound();

  const supabase = await createClient();
  const plan = await getPlan(supabase, params.planId);
  if (!plan) notFound();

  return (
    <main className="min-h-screen bg-ink-950">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/plans" className="text-sm text-white/40 transition-colors hover:text-white/80">
            ← 我的行程 · Plans
          </Link>
          <DeletePlanButton planId={plan.id} />
        </div>

        <h1 className="text-2xl font-bold text-white">{plan.title}</h1>

        {plan.location && (
          <a
            href={googleMapsUrl(plan.location)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-white/50 underline decoration-white/20 underline-offset-2 hover:text-white/80"
          >
            📍 {plan.location} · 在 Google 地圖開啟
          </a>
        )}

        <div className="mt-6 whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[15px] leading-relaxed text-white/90">
          {plan.content}
        </div>
      </div>
    </main>
  );
}
