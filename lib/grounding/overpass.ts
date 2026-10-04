import { parseOverpass, type LatLng, type VanSpot } from "@/lib/model/van";

/**
 * Campsites, water fills, and dump stations near a night's base, from
 * OpenStreetMap via Overpass (free, worldwide, no key). Returns null if
 * Overpass is down or slow, so the app can say "try again" instead of "none".
 */

const ENDPOINT = "https://overpass-api.de/api/interpreter";

export function overpassQuery(c: LatLng, campKm = 30, serviceKm = 50): string {
  const at = (km: number) => `(around:${km * 1000},${c.lat.toFixed(5)},${c.lng.toFixed(5)})`;
  return `[out:json][timeout:25];
(
  nwr${at(campKm)}["tourism"~"^(camp_site|caravan_site)$"];
  nwr${at(serviceKm)}["amenity"="sanitary_dump_station"];
  nwr${at(serviceKm)}["amenity"="water_point"];
);
out center tags 300;`;
}

export async function spotsNear(c: LatLng): Promise<VanSpot[] | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Sidequest trip planner (github.com/Eder-Betterway/sidequest)" },
      body: `data=${encodeURIComponent(overpassQuery(c))}`,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error("Overpass", res.status);
      return null;
    }
    return parseOverpass(await res.json(), c);
  } catch (err) {
    console.error("Overpass failed", err);
    return null;
  }
}
