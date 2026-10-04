import { mapsSearchUrl, type HoursResult } from "@/lib/model/place";

/**
 * Opening hours from Google Places (New), only when GOOGLE_PLACES_API_KEY is
 * set. Hours are fetched live when asked for and not stored (Google's terms
 * limit caching). Without a key, the app shows a "check hours" link instead.
 */

interface PlacesResponse {
  places?: {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    googleMapsUri?: string;
    regularOpeningHours?: { weekdayDescriptions?: string[] };
  }[];
}

export function parseHours(body: PlacesResponse, query: string, now: number): HoursResult {
  const p = body.places?.[0];
  if (!p) return { available: false, mapsUrl: mapsSearchUrl(query) };
  const lines = p.regularOpeningHours?.weekdayDescriptions ?? [];
  if (!lines.length) return { available: false, mapsUrl: p.googleMapsUri ?? mapsSearchUrl(query) };
  return {
    available: true,
    name: p.displayName?.text ?? query,
    address: p.formattedAddress ?? null,
    lines,
    mapsUrl: p.googleMapsUri ?? null,
    checkedAt: now,
  };
}

export async function hoursFor(
  query: string,
  near: { lat: number; lng: number } | null,
  fetchImpl: typeof fetch = fetch
): Promise<HoursResult> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { available: false, mapsUrl: mapsSearchUrl(query) };
  try {
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.regularOpeningHours",
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } } } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { available: false, mapsUrl: mapsSearchUrl(query) };
    return parseHours((await res.json()) as PlacesResponse, query, Date.now());
  } catch {
    return { available: false, mapsUrl: mapsSearchUrl(query) };
  }
}
