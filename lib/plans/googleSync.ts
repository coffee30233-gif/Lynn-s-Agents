import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/plans/queries";
import { getGoogleRefreshToken, setGoogleEventId } from "@/lib/plans/queries";
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/google/calendar";
import { stripMarkdown } from "@/lib/text/stripMarkdown";

/**
 * Fire-and-forget push to Google Calendar, called inline from plan
 * create/delete so it "just happens" without a separate button click.
 * Deliberately swallows errors (missing connection, no date, expired
 * token, ...) instead of throwing — saving/deleting a plan must still
 * succeed even if the calendar push fails; the manual "加入 Google 行事曆"
 * button on the plan page remains as a retry path when this silently no-ops.
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
    const eventId = await upsertCalendarEvent(refreshToken, plan.googleEventId, {
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
