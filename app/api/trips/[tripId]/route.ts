import { NextRequest, NextResponse } from "next/server";
import { deleteTrip, getTrip, updateTrip } from "@/lib/trips/queries";
import { normalizeTripPlan } from "@/lib/trips/normalize";
import { readJson, requireUser } from "@/lib/trips/routeHelpers";
import { validateTripRequest } from "@/lib/trips/types";

/** PATCH /api/trips/:id — saves the user's edits to a trip they already
 * selected. Sends the whole plan back each time (it's small), and the plan
 * is re-normalized here rather than trusted. */
export async function PATCH(req: NextRequest, { params }: { params: { tripId: string } }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const trip = await getTrip(auth.supabase, params.tripId);
  if (!trip) return NextResponse.json({ error: "找不到這個行程" }, { status: 404 });

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  // Region isn't editable (it's what the trip was generated for) — pass the
  // stored one through so the shared validator sees a complete request.
  const invalid = validateTripRequest({ ...body, region: trip.region }, { allowPast: true });
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 100) : "";
  if (!title) return NextResponse.json({ error: "行程名稱不能是空的" }, { status: 400 });

  await updateTrip(auth.supabase, trip.id, {
    title,
    startDate: body.startDate as string,
    endDate: body.endDate as string,
    plan: normalizeTripPlan(body.plan),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { tripId: string } }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const trip = await getTrip(auth.supabase, params.tripId);
  if (!trip) return NextResponse.json({ error: "找不到這個行程" }, { status: 404 });

  await deleteTrip(auth.supabase, trip.id);
  return NextResponse.json({ ok: true });
}
