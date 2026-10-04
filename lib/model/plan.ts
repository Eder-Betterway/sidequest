import { z } from "zod";
import type { Vibe, VibeOverride } from "@/lib/plan/vibe";

/**
 * The plan: options to pick from, then days with items. These schemas double
 * as the shapes Claude must return (structured outputs), so field descriptions
 * matter: the model reads them.
 */

// ---------- Options ----------

export const RouteStopSchema = z.object({
  place: z.string().describe("Town, park, or area, specific enough to find on a map, e.g. 'Moab, Utah'"),
  nights: z.number().int().min(0).describe("Nights spent here. 0 for a pass-through stop."),
  why: z.string().describe("One short line on why this stop, tied to their interests"),
});

export const OptionSchema = z.object({
  title: z.string().describe("A short, vivid name for this take on the trip, 2 to 5 words"),
  pitch: z.string().describe("Two sentences selling this version to these travelers"),
  differsBy: z.string().describe("One sentence on what makes this option different from the other two"),
  route: z.array(RouteStopSchema).min(1).describe("Stops in order, covering every night of the trip"),
  highlights: z.array(z.string()).describe("3 to 5 standout moments"),
  tradeoffs: z.array(z.string()).describe("1 to 3 honest downsides"),
  milestoneFit: z.string().describe("How the required and preferred milestones fit, or 'No milestones'"),
  estDriveHours: z.number().describe("Rough total hours of driving or transit for the whole trip"),
  pace: z.enum(["chill", "balanced", "packed"]),
});
export type TripOption = z.infer<typeof OptionSchema>;

export const OptionsResultSchema = z.object({
  options: z.array(OptionSchema).length(3),
});

/** Stored option (`trips/{id}/options/{optionId}`). */
export interface StoredOption extends TripOption {
  id: string;
  createdAt: number;
  createdBy: string;
}

// ---------- Days and items ----------

export const ITEM_KINDS = ["activity", "meal", "drive", "sleep", "milestone", "free", "errand"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const PlanItemSchema = z.object({
  kind: z.enum(ITEM_KINDS),
  title: z.string().describe("Short, specific: 'Sunrise hike to Delicate Arch', not 'Hike'"),
  start: z.string().nullable().describe("Local start time HH:MM (24h), or null if flexible"),
  end: z.string().nullable().describe("Local end time HH:MM (24h), or null"),
  place: z.string().nullable().describe("Where, specific enough to search for, or null"),
  notes: z.string().describe("Practical tip in one sentence, or empty. Mark unverifiable facts with '(check)'."),
});
export type PlanItemDraft = z.infer<typeof PlanItemSchema>;

export const DayDraftSchema = z.object({
  date: z.string().describe("ISO date YYYY-MM-DD"),
  base: z.string().describe("Where you sleep tonight (or the main area for the day), map-findable"),
  title: z.string().describe("A 2 to 6 word theme for the day"),
  items: z.array(PlanItemSchema),
});
export type DayDraft = z.infer<typeof DayDraftSchema>;

export const ReplanResultSchema = z.object({
  summary: z.string().describe("One or two plain sentences on what changed and why"),
  items: z.array(PlanItemSchema).describe("The day's complete set of unlocked items, in time order"),
});

export const RerouteResultSchema = z.object({
  summary: z.string().describe("One to three plain sentences on what changed across the trip and why"),
  days: z
    .array(DayDraftSchema)
    .describe("ONLY the days that change. Each is complete: its base, title, and every unlocked item for that day, in time order"),
});

export const DaysResultSchema = z.object({
  days: z.array(DayDraftSchema),
});

export interface Place {
  name: string;
  lat: number;
  lng: number;
  timezone: string;
  /** ISO 3166 two-letter code, for holidays. Missing on places saved before deep-dives. */
  countryCode?: string | null;
}

/** Stored day (`trips/{id}/days/{date}`). */
export interface StoredDay {
  date: string;
  base: string;
  title: string;
  place: Place | null;
  updatedAt: number;
  /** This day's dial overrides, if any. */
  vibe?: VibeOverride;
  /** The vibe the day was last planned with, to notice when the dials moved. */
  plannedVibe?: Vibe;
}

/** Stored item (`trips/{id}/items/{itemId}`). One record per item so two phones can edit a day offline. */
export interface StoredItem extends PlanItemDraft {
  id: string;
  dayDate: string;
  order: number;
  locked: boolean;
  source: "ai" | "user" | "milestone";
  milestoneId: string | null;
  updatedAt: number;
  updatedBy: string;
}

// ---------- Helpers ----------

/**
 * Three options should really be three different trips. Two options are "too
 * similar" when most of their overnight stops are the same places.
 */
export function tooSimilar(a: TripOption, b: TripOption): boolean {
  const norm = (s: string) => s.toLowerCase().split(",")[0].trim();
  const stays = (o: TripOption) => new Set(o.route.filter((s) => s.nights > 0).map((s) => norm(s.place)));
  const sa = stays(a);
  const sb = stays(b);
  if (sa.size === 0 || sb.size === 0) return false;
  let shared = 0;
  for (const p of sa) if (sb.has(p)) shared++;
  return shared / Math.min(sa.size, sb.size) >= 0.8;
}

export function totalNights(o: TripOption): number {
  return o.route.reduce((n, s) => n + s.nights, 0);
}

/** "HH:MM" -> minutes since midnight, or null. */
export function toMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Sort a day's items by time. Untimed items ("open afternoon") stay attached to
 * the timed item before them, so they don't all sink to the bottom.
 */
export function sortItems<T extends { start: string | null; order: number }>(items: T[]): T[] {
  const byOrder = [...items].sort((a, b) => a.order - b.order);
  let carry = -1;
  const keyed = byOrder.map((item, i) => {
    const t = toMinutes(item.start);
    if (t !== null) carry = t;
    return { item, key: t ?? carry, i };
  });
  return keyed.sort((a, b) => a.key - b.key || a.i - b.i).map((k) => k.item);
}

/** "14:30" -> "2:30pm" (imperial) or "14:30" (metric folks usually read 24h). */
export function formatTime(t: string | null, units: "imperial" | "metric"): string {
  const m = toMinutes(t);
  if (m === null) return "";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (units === "metric") return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return min === 0 ? `${h12}${suffix}` : `${h12}:${String(min).padStart(2, "0")}${suffix}`;
}
