import type { Place } from "@/lib/model/plan";

/**
 * Place name -> coordinates and time zone, via Open-Meteo's free geocoder
 * (no key). Used so sun times and weather are computed for the right spot.
 *
 * "Moab, Utah": searches "Moab", then prefers the result whose region or
 * country matches "Utah".
 */

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  admin1?: string;
  country?: string;
  country_code?: string;
}

export function pickResult(query: string, results: GeoResult[]): GeoResult | null {
  if (!results.length) return null;
  const hints = query
    .split(",")
    .slice(1)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!hints.length) return results[0];
  const score = (r: GeoResult) =>
    hints.filter((h) =>
      [r.admin1, r.country, r.country_code].some((v) => v && (v.toLowerCase() === h || v.toLowerCase().includes(h)))
    ).length;
  return [...results].sort((a, b) => score(b) - score(a))[0];
}

export async function geocode(query: string, fetchImpl: typeof fetch = fetch): Promise<Place | null> {
  const name = query.split(",")[0].trim();
  if (!name) return null;
  if (process.env.AI_MOCK === "1") return mockPlace(query);
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: GeoResult[] };
    const hit = pickResult(query, body.results ?? []);
    return hit ? { name: query, lat: hit.latitude, lng: hit.longitude, timezone: hit.timezone } : null;
  } catch {
    return null;
  }
}

/** Geocode several names at once, each looked up once. */
export async function geocodeAll(names: string[]): Promise<Map<string, Place | null>> {
  const unique = [...new Set(names.filter(Boolean))];
  const found = await Promise.all(unique.map((n) => geocode(n)));
  return new Map(unique.map((n, i) => [n, found[i]]));
}

/** Deterministic stand-in for tests: somewhere in the US Southwest. */
function mockPlace(query: string): Place {
  let h = 0;
  for (const c of query) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return { name: query, lat: 36 + (h % 40) / 10, lng: -112 + (h % 50) / 10, timezone: "America/Denver" };
}
