import { haversineKm, type LatLng } from "@/lib/model/van";
import { glowFrom, type Glow } from "./sky";

/**
 * Towns and cities around a place, from OpenStreetMap via Overpass (free,
 * worldwide, no key), turned into a light-pollution estimate. Null if
 * Overpass is down, so the app shows nothing rather than a wrong "dark".
 */

const ENDPOINT = "https://overpass-api.de/api/interpreter";

export function townsQuery(c: LatLng): string {
  const at = (km: number) => `(around:${km * 1000},${c.lat.toFixed(5)},${c.lng.toFixed(5)})`;
  return `[out:json][timeout:25];
(
  node${at(80)}["place"~"^(city|town)$"]["population"];
  node${at(250)}["place"="city"]["population"];
);
out tags center 400;`;
}

/** "12,345", "12 345", "12345 (2020)" all read as 12345. */
export function parsePopulation(raw: string | undefined): number {
  if (!raw) return 0;
  const m = raw.replace(/[\s,.'](?=\d{3}\b)/g, "").match(/\d+/);
  return m ? Number(m[0]) : 0;
}

interface OverpassNode {
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

export function parseTowns(body: { elements?: OverpassNode[] }, c: LatLng): { name: string; population: number; km: number }[] {
  const seen = new Set<number>();
  return (body.elements ?? [])
    .filter((e) => typeof e.lat === "number" && typeof e.lon === "number" && !seen.has(e.id) && seen.add(e.id))
    .map((e) => ({
      name: e.tags?.name ?? "A town",
      population: parsePopulation(e.tags?.population),
      km: haversineKm(c, { lat: e.lat!, lng: e.lon! }),
    }))
    .filter((t) => t.population > 0);
}

export async function glowNear(c: LatLng, fetchImpl: typeof fetch = fetch): Promise<Glow | null> {
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Sidequest trip planner (github.com/Eder-Betterway/sidequest)" },
      body: `data=${encodeURIComponent(townsQuery(c))}`,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return glowFrom(parseTowns(await res.json(), c));
  } catch {
    return null;
  }
}
