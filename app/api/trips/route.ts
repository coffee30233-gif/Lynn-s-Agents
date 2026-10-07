import { NextRequest, NextResponse } from "next/server";
import { createTrip } from "@/lib/trips/queries";
import { normalizeTripPlan } from "@/lib/trips/normalize";
import { readJson, requireUser } from "@/lib/trips/routeHelpers";
import { tripDayCount, tripLengthLabel, validateTripRequest, type TripRegion } from "@/lib/trips/types";

/** POST /api/trips — "選定這個行程": saves the plan the user picked. */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const invalid = validateTripRequest(body, { allowPast: true });
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const destination = typeof body.destination === "string" ? body.destination.trim().slice(0, 100) : "";
  if (!destination) return NextResponse.json({ error: "缺少目的地" }, { status: 400 });
  const country = typeof body.country === "string" ? body.country.trim().slice(0, 100) : undefined;

  const startDate = body.startDate as string;
  const endDate = body.endDate as string;
  const title =
    (typeof body.title === "string" ? body.title.trim().slice(0, 100) : "") ||
    `${destination} ${tripLengthLabel(tripDayCount(startDate, endDate))}`;

  const id = await createTrip(auth.supabase, auth.userId, {
    title,
    region: body.region as TripRegion,
    destination,
    country,
    startDate,
    endDate,
    plan: normalizeTripPlan(body.plan),
  });

  return NextResponse.json({ id });
}
