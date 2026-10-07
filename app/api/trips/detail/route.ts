import { NextRequest, NextResponse } from "next/server";
import { generateTripDetail } from "@/lib/trips/gemini";
import { readJson, requireUserIfConfigured, tripErrorResponse } from "@/lib/trips/routeHelpers";
import { validateTripRequest, type TripRegion } from "@/lib/trips/types";

// The heavy one: a search step, then writing out a full itinerary with the
// stronger model. ~25-35s measured for 5-10 days; the 10-day cap on trip
// length (MAX_TRIP_DAYS) exists to keep this under the limit.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireUserIfConfigured();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const invalid = validateTripRequest(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const destination = typeof body.destination === "string" ? body.destination.trim().slice(0, 100) : "";
  if (!destination) return NextResponse.json({ error: "缺少目的地" }, { status: 400 });
  const country = typeof body.country === "string" ? body.country.trim().slice(0, 100) : "";
  const estimatedBudget =
    typeof body.estimatedBudget === "number" && Number.isFinite(body.estimatedBudget) && body.estimatedBudget > 0
      ? Math.round(body.estimatedBudget)
      : undefined;

  try {
    const plan = await generateTripDetail({
      region: body.region as TripRegion,
      startDate: body.startDate as string,
      endDate: body.endDate as string,
      destination,
      country,
      estimatedBudget,
    });
    return NextResponse.json({ plan });
  } catch (err) {
    return tripErrorResponse(err);
  }
}
