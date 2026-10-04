import type { TripInputs, Vehicle } from "./inputs";

/**
 * Campervan smarts: drive legs between bases and places to sleep and restock
 * near each night. Map data on vehicle limits is patchy, so everything here is
 * labeled "check signs and limits" in the app.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DriveLeg {
  fromName: string;
  toName: string;
  km: number;
  hours: number;
  /** "route": real road routing (OpenRouteService). "estimate": straight line, padded. */
  source: "route" | "estimate";
  /** Which routing profile was used, so a changed vehicle re-checks. */
  profile: string;
  checkedAt: number;
}

export const SPOT_KINDS = ["camp", "water", "dump"] as const;
export type SpotKind = (typeof SPOT_KINDS)[number];

export interface VanSpot {
  id: string;
  kind: SpotKind;
  name: string;
  lat: number;
  lng: number;
  /** Straight-line distance from the night's base. */
  km: number;
  fee: boolean | null;
  maxLengthM: number | null;
  url: string | null;
  /** Short facts worth a glance: "Showers", "Water too", "Reservations". */
  facts: string[];
}

export interface NearbySpots {
  key: string;
  name: string;
  spots: VanSpot[];
  fetchedAt: number;
}

// ---------- Distances and drive legs ----------

export function haversineKm(a: LatLng, b: LatLng): number {
  const r = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Roads wind, and vans aren't fast: pad the straight line and assume 70 km/h. */
export function estimateLeg(a: LatLng, b: LatLng): { km: number; hours: number } {
  const km = haversineKm(a, b) * 1.3;
  return { km: Math.round(km), hours: Math.round((km / 70) * 10) / 10 };
}

/**
 * Heavier or taller vans route as a truck so low bridges and weight limits
 * count. Most campervans under 3.5 t are cars on the road, and the truck
 * profile would send them the long way around for no reason.
 */
export function routeProfile(v: Vehicle | null): "driving-hgv" | "driving-car" {
  if (!v) return "driving-car";
  const big = (v.weightT ?? 0) > 3.5 || (v.heightM ?? 0) > 3.2 || (v.lengthM ?? 0) > 7.5;
  return big ? "driving-hgv" : "driving-car";
}

/** The legs of a trip: each day you sleep somewhere new, the drive in from the night before. */
export function legsFor(days: { date: string; base: string; place: (LatLng & { name: string }) | null }[]) {
  const legs: { date: string; from: LatLng & { name: string }; to: LatLng & { name: string } }[] = [];
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1];
    const day = days[i];
    if (prev.base === day.base || !prev.place || !day.place) continue;
    legs.push({ date: day.date, from: prev.place, to: day.place });
  }
  return legs;
}

export function legKey(from: string, to: string): string {
  const k = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `leg-${k(from)}--${k(to)}`;
}

export interface Flag {
  level: "warn" | "info";
  text: string;
}

/** Plain-language heads-ups for a drive, from the trip's own limits. */
export function legFlags(leg: Pick<DriveLeg, "km" | "hours">, inputs: Pick<TripInputs, "maxDriveHoursPerDay" | "noNightDriving" | "vehicle">): Flag[] {
  const flags: Flag[] = [];
  const max = inputs.maxDriveHoursPerDay;
  if (max && leg.hours > max) {
    flags.push({ level: "warn", text: `Over your ${formatHours(max)} a day. Split it or start early.` });
  } else if (!max && leg.hours > 6) {
    flags.push({ level: "warn", text: "A long drive day." });
  }
  const range = inputs.vehicle?.rangeKm;
  if (range) {
    if (leg.km > range) flags.push({ level: "warn", text: "Longer than one tank. Refuel on the way." });
    else if (leg.km > range * 0.75) flags.push({ level: "info", text: "Uses most of a tank. Fill up before you go." });
  }
  if (inputs.noNightDriving && leg.hours > 7) {
    flags.push({ level: "info", text: "Hard to finish before dark with stops. Leave early." });
  }
  return flags;
}

// ---------- Spots ----------

/** A posted length limit shorter than your van. Missing data isn't a pass, just unknown. */
export function tooLong(spot: Pick<VanSpot, "maxLengthM">, v: Vehicle | null): boolean {
  return Boolean(spot.maxLengthM && v?.lengthM && v.lengthM > spot.maxLengthM);
}

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const PER_KIND = 10;

/** Meters from an OSM length tag like "9", "9 m", or "30'". */
export function parseLength(raw: string | undefined): number | null {
  if (!raw) return null;
  const feet = /^(\d+(?:\.\d+)?)\s*(?:'|ft)/.exec(raw);
  if (feet) return Math.round(Number(feet[1]) * 0.3048 * 10) / 10;
  const m = /^(\d+(?:\.\d+)?)\s*m?$/.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

function kindOf(tags: Record<string, string>): SpotKind | null {
  if (tags.tourism === "camp_site" || tags.tourism === "caravan_site") {
    // Tent-only sites don't help a van.
    if (tags.caravans === "no" || tags.motorhome === "no") return null;
    return "camp";
  }
  if (tags.amenity === "sanitary_dump_station") return "dump";
  if (tags.amenity === "water_point") return "water";
  return null;
}

const FALLBACK_NAME: Record<SpotKind, string> = { camp: "Campsite", water: "Water fill", dump: "Dump station" };

/** Turn an Overpass answer into the nearest few spots of each kind. */
export function parseOverpass(json: { elements?: OsmElement[] }, center: LatLng): VanSpot[] {
  const spots: VanSpot[] = [];
  for (const el of json.elements ?? []) {
    const tags = el.tags ?? {};
    const kind = kindOf(tags);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!kind || lat === undefined || lng === undefined) continue;
    const facts: string[] = [];
    if (tags.tourism === "caravan_site") facts.push("RV park");
    if (tags.shower && tags.shower !== "no") facts.push("Showers");
    if (tags.toilets === "yes") facts.push("Toilets");
    if (tags.power_supply === "yes") facts.push("Power");
    if (kind !== "water" && (tags.water_point === "yes" || tags.drinking_water === "yes")) facts.push("Water too");
    if (kind !== "dump" && tags.sanitary_dump_station === "yes") facts.push("Dump too");
    if (tags.reservation === "required") facts.push("Reserve ahead");
    if (tags.backcountry === "yes") facts.push("Backcountry");
    if (tags.access === "private" || tags.access === "customers") facts.push("Customers only");
    spots.push({
      id: `${el.type}/${el.id}`,
      kind,
      name: (tags.name || FALLBACK_NAME[kind]).slice(0, 120),
      lat,
      lng,
      km: Math.round(haversineKm(center, { lat, lng }) * 10) / 10,
      fee: tags.fee === "yes" ? true : tags.fee === "no" ? false : null,
      maxLengthM: parseLength(tags.maxlength),
      url: (tags.website || tags["contact:website"] || tags.url || null)?.slice(0, 300) ?? null,
      facts,
    });
  }
  spots.sort((a, b) => a.km - b.km);
  const count: Record<SpotKind, number> = { camp: 0, water: 0, dump: 0 };
  return spots.filter((s) => count[s.kind]++ < PER_KIND);
}

// ---------- Formatting ----------

export function formatHours(h: number): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (hh === 0) return `${mm}m`;
  return mm === 0 ? `${hh}h` : `${hh}h ${mm}m`;
}

export function formatDistance(km: number, units: "imperial" | "metric"): string {
  if (units === "metric") return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  const mi = km * 0.621371;
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

export function formatLength(m: number, units: "imperial" | "metric"): string {
  return units === "metric" ? `${m} m` : `${Math.round(m * 3.28084)} ft`;
}

export function mapsPinUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

/** Federal campgrounds and permits in the US. Search link only: no key needed. */
export function recreationGovUrl(place: string): string {
  return `https://www.recreation.gov/search?q=${encodeURIComponent(place)}&entity_type=campground`;
}
