import type { SupabaseClient } from "@supabase/supabase-js";
import type { Source } from "@/types";

export interface Plan {
  id: string;
  title: string;
  location: string | null;
  eventDate: string | null; // "YYYY-MM-DD", or null if unscheduled
  content: string;
  sources: Source[];
  createdAt: string;
  googleEventId: string | null;
}

export async function createPlan(
  supabase: SupabaseClient,
  userId: string,
  input: {
    title: string;
    location?: string;
    eventDate?: string;
    content: string;
    sources?: Source[];
    sourceConversationId?: string;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from("plans")
    .insert({
      user_id: userId,
      title: input.title,
      location: input.location || null,
      event_date: input.eventDate || null,
      content: input.content,
      sources: input.sources && input.sources.length > 0 ? input.sources : null,
      source_conversation_id: input.sourceConversationId || null,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to save plan: ${error?.message}`);
  return data.id;
}

function mapRow(row: {
  id: string;
  title: string;
  location: string | null;
  event_date: string | null;
  content: string;
  sources: Source[] | null;
  created_at: string;
  google_event_id: string | null;
}): Plan {
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    eventDate: row.event_date,
    content: row.content,
    sources: row.sources ?? [],
    createdAt: row.created_at,
    googleEventId: row.google_event_id,
  };
}

const PLAN_COLUMNS = "id, title, location, event_date, content, sources, created_at, google_event_id";

export async function listPlansForUser(supabase: SupabaseClient): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("plans")
    .select(PLAN_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list plans: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export async function getPlan(supabase: SupabaseClient, planId: string): Promise<Plan | null> {
  const { data } = await supabase
    .from("plans")
    .select(PLAN_COLUMNS)
    .eq("id", planId)
    .single();

  return data ? mapRow(data) : null;
}

export async function deletePlan(supabase: SupabaseClient, planId: string): Promise<void> {
  const { error } = await supabase.from("plans").delete().eq("id", planId);
  if (error) throw new Error(`Failed to delete plan: ${error.message}`);
}

export async function updatePlan(
  supabase: SupabaseClient,
  planId: string,
  input: { title: string; location: string | null; eventDate: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("plans")
    .update({ title: input.title, location: input.location, event_date: input.eventDate })
    .eq("id", planId);
  if (error) throw new Error(`Failed to update plan: ${error.message}`);
}

export async function setGoogleEventId(
  supabase: SupabaseClient,
  planId: string,
  googleEventId: string
): Promise<void> {
  const { error } = await supabase
    .from("plans")
    .update({ google_event_id: googleEventId })
    .eq("id", planId);
  if (error) throw new Error(`Failed to save google_event_id: ${error.message}`);
}

export async function clearGoogleEventId(supabase: SupabaseClient, planId: string): Promise<void> {
  const { error } = await supabase.from("plans").update({ google_event_id: null }).eq("id", planId);
  if (error) throw new Error(`Failed to clear google_event_id: ${error.message}`);
}

export async function hasGoogleCalendarConnected(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("google_calendar_tokens")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function getGoogleRefreshToken(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("google_calendar_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.refresh_token ?? null;
}
