import { NextRequest, NextResponse } from "next/server";
import { searchPlaces } from "@/lib/places/googlePlaces";

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not configured" }, { status: 501 });
  }

  const query = req.nextUrl.searchParams.get("query")?.trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const places = await searchPlaces(query);
  if (places === null) {
    return NextResponse.json({ error: "Failed to search places" }, { status: 502 });
  }

  return NextResponse.json({ places });
}
