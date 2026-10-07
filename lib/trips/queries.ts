import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTripPlan } from "./normalize";
import type { TripPlan, TripRegion } from "./types";

export interface Trip {
  id: string;
  title: string;
  region: TripRegion;
  destination: string;
  country: string | null;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
  plan: TripPlan;
  createdAt: string;
  updatedAt: string;
}

interface TripRow {
  id: string;
  title: string;
  region: TripRegion;
  destination: string;
  country: string | null;
  start_date: string;
  end_date: string;
  plan: unknown;
  created_at: string;
  updated_at: string;
}

const TRIP_COLUMNS = "id, title, region, destination, country, start_date, end_date, plan, created_at, updated_at";

function mapRow(row: TripRow): Trip {
  return {
    id: row.id,
    title: row.title,
    region: row.region,
    destination: row.destination,
    country: row.country,
    startDate: row.start_date,
    endDate: row.end_date,
    // Re-normalized on the way out too, not just on the way in — cheap, and
    // means a row written by an older version of the plan shape (or edited
    // by hand in the Supabase dashboard) can't crash the page.
    plan: normalizeTripPlan(row.plan),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createTrip(
  supabase: SupabaseClient,
  userId: string,
  input: {
    title: string;
    region: TripRegion;
    destination: string;
    country?: string;
    startDate: string;
    endDate: string;
    plan: TripPlan;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from("trips")
    .insert({
      user_id: userId,
      title: input.title,
      region: input.region,
      destination: input.destination,
      country: input.country || null,
      start_date: input.startDate,
      end_date: input.endDate,
      plan: input.plan,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to save trip: ${error?.message}`);
  return data.id;
}

export async function listTripsForUser(supabase: SupabaseClient): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .order("start_date", { ascending: false });

  if (error) throw new Error(`Failed to list trips: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export async function getTrip(supabase: SupabaseClient, tripId: string): Promise<Trip | null> {
  const { data } = await supabase.from("trips").select(TRIP_COLUMNS).eq("id", tripId).single();
  return data ? mapRow(data) : null;
}

export async function updateTrip(
  supabase: SupabaseClient,
  tripId: string,
  input: { title: string; startDate: string; endDate: string; plan: TripPlan }
): Promise<void> {
  const { error } = await supabase
    .from("trips")
    .update({
      title: input.title,
      start_date: input.startDate,
      end_date: input.endDate,
      plan: input.plan,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tripId);
  if (error) throw new Error(`Failed to update trip: ${error.message}`);
}

export async function deleteTrip(supabase: SupabaseClient, tripId: string): Promise<void> {
  const { error } = await supabase.from("trips").delete().eq("id", tripId);
  if (error) throw new Error(`Failed to delete trip: ${error.message}`);
}
