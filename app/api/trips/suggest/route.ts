import { NextRequest, NextResponse } from "next/server";
import { suggestDestinations } from "@/lib/trips/gemini";
import { readJson, requireUserIfConfigured, tripErrorResponse } from "@/lib/trips/routeHelpers";
import { validateTripRequest, type TripRegion } from "@/lib/trips/types";

// Research (search) + write steps back to back — measured ~15s, but the cap
// is what matters if Gemini is having a slow day.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireUserIfConfigured();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const invalid = validateTripRequest(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const exclude = Array.isArray(body.exclude)
    ? body.exclude
        .filter((d): d is string => typeof d === "string")
        .map((d) => d.trim().slice(0, 100))
        .filter(Boolean)
        .slice(0, 15)
    : undefined;

  try {
    const suggestions = await suggestDestinations({
      region: body.region as TripRegion,
      startDate: body.startDate as string,
      endDate: body.endDate as string,
      exclude,
    });
    return NextResponse.json({ suggestions });
  } catch (err) {
    return tripErrorResponse(err);
  }
}
