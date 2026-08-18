import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/plans/queries";
import { getGoogleRefreshToken, setGoogleEventId } from "@/lib/plans/queries";
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/google/calendar";
import { stripMarkdown } from "@/lib/text/stripMarkdown";

/**
 * Fire-and-forget push to Google Calendar, called inline from plan
 * create/update so it "just happens" without a separate button click.
 * Deliberately swallows errors (missing connection, no date, expired
 * token, ...) instead of throwing — saving a plan must still succeed even
 * if the calendar push fails. There's no manual retry button; any plan this
 * silently skips gets picked up by syncAllPlansToGoogleCalendar below the
 * next time /plans or the plan itself is viewed.
 */
export async function syncPlanToGoogleCalendar(
  supabase: SupabaseClient,
  userId: string,
  plan: Plan
): Promise<void> {
  if (!plan.eventDate) return;

  const refreshToken = await getGoogleRefreshToken(supabase, userId);
  if (!refreshToken) return;

  try {
    const eventId = await upsertCalendarEvent(refreshToken, plan.googleEventId, plan.id, {
      title: plan.title,
      location: plan.location,
      date: plan.eventDate,
      description: stripMarkdown(plan.content).slice(0, 1000),
    });
    await setGoogleEventId(supabase, plan.id, eventId);
  } catch (err) {
    console.error("[google-calendar] auto-sync on save failed:", err);
  }
}

/**
 * Catches any dated plan that never made it to Google Calendar — most
 * commonly plans saved before the user connected Google Calendar in the
 * first place, since there's no manual "加入 Google 行事曆" button anymore
 * to backfill those by hand. Called from the plans list and plan detail
 * pages so every dated plan is guaranteed synced by the time you look at
 * either. Cheap no-op when everything's already synced (the common case).
 */
export async function syncAllPlansToGoogleCalendar(
  supabase: SupabaseClient,
  userId: string,
  plans: Plan[]
): Promise<void> {
  const unsynced = plans.filter((p) => p.eventDate && !p.googleEventId);
  if (unsynced.length === 0) return;

  const refreshToken = await getGoogleRefreshToken(supabase, userId);
  if (!refreshToken) return;

  await Promise.all(
    unsynced.map(async (plan) => {
      try {
        const eventId = await upsertCalendarEvent(refreshToken, plan.googleEventId, plan.id, {
          title: plan.title,
          location: plan.location,
          date: plan.eventDate as string,
          description: stripMarkdown(plan.content).slice(0, 1000),
        });
        await setGoogleEventId(supabase, plan.id, eventId);
      } catch (err) {
        console.error("[google-calendar] backfill sync failed for plan", plan.id, err);
      }
    })
  );
}

export async function removePlanFromGoogleCalendar(
  supabase: SupabaseClient,
  userId: string,
  plan: Plan
): Promise<void> {
  if (!plan.googleEventId) return;

  const refreshToken = await getGoogleRefreshToken(supabase, userId);
  if (!refreshToken) return;

  try {
    await deleteCalendarEvent(refreshToken, plan.googleEventId);
  } catch (err) {
    console.error("[google-calendar] auto-remove on delete failed:", err);
  }
}
