import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlan, hasGoogleCalendarConnected } from "@/lib/plans/queries";
import { DeletePlanButton } from "@/components/DeletePlanButton";
import { EditPlanButton } from "@/components/EditPlanButton";
import { SourceLinks } from "@/components/SourceLinks";
import { stripMarkdown } from "@/lib/text/stripMarkdown";
import { parseItinerary } from "@/lib/text/parseItinerary";
import { findDateInconsistencies } from "@/lib/text/verifyDates";
import { WeatherLookup } from "@/components/WeatherLookup";
import { PlacesLookup } from "@/components/PlacesLookup";
import { MapEmbed } from "@/components/MapEmbed";
import { GoogleCalendarButton } from "@/components/GoogleCalendarButton";
import { resolveCounty } from "@/lib/places/googlePlaces";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const calendarConnected = user ? await hasGoogleCalendarConnected(supabase, user.id) : false;

  const { intro, sections } = parseItinerary(stripMarkdown(plan.content));
  const hasUnverifiedPracticalInfo =
    plan.sources.length === 0 && sections.some((s) => s.label === "實用資訊");
  // Reference the date the plan was actually written, not "now" — viewing a
  // months-old saved plan shouldn't roll its dates into next year.
  const dateIssues = findDateInconsistencies(plan.content, new Date(plan.createdAt));
  const county = plan.location ? await resolveCounty(plan.location) : null;

  return (
    <main className="min-h-dvh bg-ink-950">
      <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/plans" className="text-sm text-white/40 transition-colors hover:text-white/80">
            ← 我的行程 · Plans
          </Link>
          <div className="flex items-center gap-4">
            <EditPlanButton
              planId={plan.id}
              initialTitle={plan.title}
              initialLocation={plan.location}
              initialEventDate={plan.eventDate}
            />
            <DeletePlanButton planId={plan.id} />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white">{plan.title}</h1>

        {plan.eventDate ? (
          <GoogleCalendarButton
            planId={plan.id}
            connected={calendarConnected}
            initialSynced={Boolean(plan.googleEventId)}
          />
        ) : (
          <p className="mt-2 text-xs text-white/30">此行程沒有日期，補上日期後才能加入 Google 行事曆</p>
        )}

        {hasUnverifiedPracticalInfo && (
          <p className="mt-2 text-sm text-amber-300/80">
            ⚠️ 這份行程沒有搜尋來源佐證，天氣／交通等資訊可能不準確，請自行查證後再行動。
          </p>
        )}

        {dateIssues.length > 0 && (
          <div className="mt-2 text-sm text-red-300/90">
            {dateIssues.map((issue, i) => (
              <p key={i}>
                ⚠️ 「{issue.raw}」日期與星期對不上——{issue.raw.split(/[（(]/)[0]}實際上是{issue.actualWeekday}，不是{issue.statedWeekday}。
              </p>
            ))}
          </div>
        )}

        {plan.location && (
          <>
            <a
              href={googleMapsUrl(plan.location)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm text-white/50 underline decoration-white/20 underline-offset-2 hover:text-white/80"
            >
              📍 {plan.location} · 在 Google 地圖開啟
            </a>
            <div className="mt-2">
              <MapEmbed query={plan.location} mode="place" height={300} />
            </div>
          </>
        )}

        {intro && (
          <div className="mt-6 whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[15px] leading-relaxed text-white/90">
            {intro}
          </div>
        )}

        {sections.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {sections.map((section, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <p className="mb-2 text-sm font-semibold text-white">
                  {section.emoji} {section.label}
                </p>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
        )}

        {plan.sources.length > 0 && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-semibold text-white">🔗 資料來源</p>
            <SourceLinks sources={plan.sources} />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4">
          <WeatherLookup initialCounty={county} />
          <PlacesLookup initialLocation={plan.location ?? undefined} />
        </div>
      </div>
    </main>
  );
}
