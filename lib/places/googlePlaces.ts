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

  if (!res.ok) return null;

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
