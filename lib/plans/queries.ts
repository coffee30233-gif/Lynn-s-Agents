import type { SupabaseClient } from "@supabase/supabase-js";

export interface Plan {
  id: string;
  title: string;
  location: string | null;
  eventDate: string | null; // "YYYY-MM-DD", or null if unscheduled
  content: string;
  createdAt: string;
}

export async function createPlan(
  supabase: SupabaseClient,
  userId: string,
  input: {
    title: string;
    location?: string;
    eventDate?: string;
    content: string;
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
  created_at: string;
}): Plan {
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    eventDate: row.event_date,
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function listPlansForUser(supabase: SupabaseClient): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, title, location, event_date, content, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list plans: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export async function getPlan(supabase: SupabaseClient, planId: string): Promise<Plan | null> {
  const { data } = await supabase
    .from("plans")
    .select("id, title, location, event_date, content, created_at")
    .eq("id", planId)
    .single();

  return data ? mapRow(data) : null;
}

export async function deletePlan(supabase: SupabaseClient, planId: string): Promise<void> {
  const { error } = await supabase.from("plans").delete().eq("id", planId);
  if (error) throw new Error(`Failed to delete plan: ${error.message}`);
}
