import { TAIWAN_COUNTIES } from "@/lib/weather/cwa";

export interface PlaceResult {
  name: string;
  address: string;
  rating?: number;
  mapsUri: string;
}

interface PlacesApiResponse {
  places?: {
    displayName?: { text?: string };
    formattedAddress?: string;
    rating?: number;
    googleMapsUri?: string;
  }[];
}

/**
 * Google Places API (New) — Text Search. Field mask is deliberately narrow
 * (display name, address, rating, maps link only) since the New API bills
 * per requested field tier; nothing here reaches into the pricier tiers.
 */
export async function searchPlaces(query: string): Promise<PlaceResult[] | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.googleMapsUri,places.rating",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "zh-TW" }),
  });

  if (!res.ok) {
    console.error("[places] search failed:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const data: PlacesApiResponse = await res.json();
  if (!data.places) return [];

  return data.places
    .filter((p) => p.displayName?.text && p.googleMapsUri)
    .slice(0, 8)
    .map((p) => ({
      name: p.displayName!.text!,
      address: p.formattedAddress ?? "",
      rating: p.rating,
      mapsUri: p.googleMapsUri!,
    }));
}

/**
 * Resolves a free-text location (e.g. "八里左岸") to one of CWA's 22
 * county/city names, by geocoding it via Places Text Search and checking
 * which county name appears in the first result's formattedAddress —
 * reuses the Places integration instead of adding a separate Geocoding
 * API key just for this. Matches both the 臺/台 spelling variants Google
 * addresses can use (confirmed both appear depending on the query).
 */
export async function resolveCounty(location: string): Promise<string | null> {
  const results = await searchPlaces(location);
  const address = results?.[0]?.address;
  if (!address) return null;

  return TAIWAN_COUNTIES.find((county) => {
    const altVariant = county.replace(/^臺/, "台");
    return address.includes(county) || address.includes(altVariant);
  }) ?? null;
}
