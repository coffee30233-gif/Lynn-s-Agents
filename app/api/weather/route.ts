import { NextRequest, NextResponse } from "next/server";
import { getCwaForecast, TAIWAN_COUNTIES } from "@/lib/weather/cwa";

export async function GET(req: NextRequest) {
  if (!process.env.CWA_API_KEY) {
    return NextResponse.json({ error: "CWA_API_KEY is not configured" }, { status: 501 });
  }

  const county = req.nextUrl.searchParams.get("county");
  if (!county || !TAIWAN_COUNTIES.includes(county as (typeof TAIWAN_COUNTIES)[number])) {
    return NextResponse.json({ error: "Unknown or missing county" }, { status: 400 });
  }

  const periods = await getCwaForecast(county);
  if (!periods) {
    return NextResponse.json({ error: "Failed to fetch forecast" }, { status: 502 });
  }

  return NextResponse.json({ county, periods });
}
