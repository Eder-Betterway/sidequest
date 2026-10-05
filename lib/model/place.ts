import { z } from "zod";
import type { Glow } from "@/lib/grounding/sky";

/**
 * Place deep-dives: what's worth knowing about a stop, for these two
 * travelers on these dates. Facts that change (weather, holidays, opening
 * hours) come from real sources; the AI writes the story and the tips, and
 * every claim it found online carries its source link.
 */

/** Stable cache key for a place name: "Moab, Utah" -> "moab-utah". */
export function placeKey(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "place"
  );
}

// ---------- What the AI returns (structured) ----------

export const PlaceInfoSchema = z.object({
  summary: z.string().describe("Two sentences on why this place is worth their time, tied to their interests"),
  history: z.string().describe("A short, vivid history in 3 to 5 sentences"),
  highlights: z
    .array(z.object({ title: z.string(), why: z.string().describe("One line, tied to their interests") }))
    .describe("3 to 6 standout things to see or do"),
  tips: z.array(z.string()).describe("2 to 5 practical tips: timing, crowds, parking, booking, local etiquette"),
  bestTimes: z.array(z.string()).describe("When to go for the best experience, e.g. 'Delicate Arch at sunset, start by 5pm'"),
  happening: z
    .array(
      z.object({
        title: z.string(),
        when: z.string().describe("Dates or days as found, within or near the trip dates"),
        url: z.string().nullable().describe("Source link if one was found, else null"),
      })
    )
    .describe("Events, markets, festivals, live music, closures during their dates. Empty if none found."),
  food: z
    .array(
      z.object({
        name: z.string().describe("The place's real name, as it appears on a map"),
        kind: z.enum(["coffee", "breakfast", "lunch", "dinner", "drinks", "groceries", "treat"]),
        why: z.string().describe("One line: what to order or why it suits them"),
        price: z.enum(["$", "$$", "$$$", "$$$$"]).nullable(),
      })
    )
    .describe("3 to 6 local places to eat or drink that suit their budget and tastes, plus a grocery stop if they're camping. Empty if the notes have none."),
  bookAhead: z
    .array(
      z.object({
        what: z.string().describe("What to reserve, e.g. 'Campsite at Jumbo Rocks' or 'Timed entry to the park'"),
        lead: z.string().describe("How far ahead, e.g. 'Opens 6 months ahead, sells out in minutes' or '1 to 2 weeks ahead'"),
        how: z.string().describe("Where or how to book, in a few words"),
        url: z.string().nullable().describe("The official booking or info link from the sources, else null"),
      })
    )
    .describe("Only things that really need a reservation, permit, or timed ticket for their dates. Empty if nothing does."),
});
export type PlaceInfo = z.infer<typeof PlaceInfoSchema>;

export interface Source {
  title: string;
  url: string;
}

/** Shared, trip-independent cache: `places/{key}`. */
export interface CachedPlace {
  key: string;
  name: string;
  wiki: WikiSummary | null;
  refreshedAt: number;
}

/** Trip-specific: `trips/{id}/placeInfo/{key}` (depends on dates and interests). */
export interface TripPlaceInfo {
  key: string;
  name: string;
  info: PlaceInfo | null;
  sources: Source[];
  weather: WeatherDay[];
  weatherKind: "forecast" | "last-year" | null;
  holidays: Holiday[];
  /** Forecast cloud cover after dark, per evening (forecast range only). Missing on older saves. */
  nightClouds?: NightCloud[];
  /** Town-light estimate for stargazing. Missing on older saves, null if it couldn't be looked up. */
  glow?: Glow | null;
  from: string;
  to: string;
  fetchedAt: number;
}

export interface NightCloud {
  date: string;
  cloud: number;
}

// ---------- Grounding results ----------

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
}

export interface WeatherDay {
  date: string;
  /** °C; the app converts for display. */
  high: number | null;
  low: number | null;
  /** Chance of rain % (forecast) or rain mm (last year). */
  rain: number | null;
  rainUnit: "%" | "mm";
  label: string;
}

export interface Holiday {
  date: string;
  name: string;
}

export interface Hours {
  available: true;
  name: string;
  address: string | null;
  /** Google's own lines, e.g. "Monday: 8:00 AM to 5:00 PM". */
  lines: string[];
  mapsUrl: string | null;
  checkedAt: number;
}

export type HoursResult = Hours | { available: false; mapsUrl: string };

/** How stale cached content can get before a refresh is offered automatically. */
export const PLACE_STALE_MS = 180 * 86_400_000;
export const HAPPENING_STALE_MS = 3 * 86_400_000;

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** °C to the trip's units, rounded. */
export function tempIn(c: number | null, units: "imperial" | "metric"): string {
  if (c === null) return "?";
  return units === "metric" ? `${Math.round(c)}°` : `${Math.round((c * 9) / 5 + 32)}°`;
}
