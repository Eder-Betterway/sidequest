import { z } from "zod";

/**
 * The vibe dials. Each runs 0 to 100. The trip has a vibe; any day can
 * override some dials. Moving a dial never calls the AI on its own: it marks
 * the day as "vibe changed" and you choose when to re-plan.
 */

export const DIALS = [
  { key: "pace", label: "Pace", low: "Chill", high: "Packed" },
  { key: "effort", label: "Effort", low: "Easy", high: "Epic" },
  { key: "path", label: "Path", low: "Iconic", high: "Hidden gems" },
  { key: "nights", label: "Nights", low: "Early", high: "Out late" },
] as const;

export type DialKey = (typeof DIALS)[number]["key"];

const dial = z.number().min(0).max(100);

export const VibeSchema = z.object({
  pace: dial.default(50),
  effort: dial.default(50),
  path: dial.default(50),
  nights: dial.default(50),
});
export type Vibe = z.infer<typeof VibeSchema>;

/** A day's overrides: only the dials it changes. */
export const VibeOverrideSchema = z.object({
  pace: dial.optional(),
  effort: dial.optional(),
  path: dial.optional(),
  nights: dial.optional(),
});
export type VibeOverride = z.infer<typeof VibeOverrideSchema>;

export const NEUTRAL: Vibe = { pace: 50, effort: 50, path: 50, nights: 50 };

export function readVibe(raw: unknown): Vibe {
  const parsed = VibeSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : NEUTRAL;
}

/** The vibe a day actually runs at: the trip's, with the day's overrides on top. */
export function effectiveVibe(trip: Vibe, day: VibeOverride | null | undefined): Vibe {
  return { ...trip, ...stripUndefined(day ?? {}) };
}

function stripUndefined(o: VibeOverride): Partial<Vibe> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<Vibe>;
}

/** A dial moved enough since the day was planned that a re-plan would change things. */
export function vibeChanged(plannedWith: Vibe | null | undefined, now: Vibe, threshold = 10): boolean {
  if (!plannedWith) return false;
  return DIALS.some(({ key }) => Math.abs(plannedWith[key] - now[key]) >= threshold);
}

/** "very chill", "a bit chill", "balanced", "a bit packed", "very packed". */
export function dialWords(key: DialKey, value: number): string {
  const d = DIALS.find((x) => x.key === key)!;
  const end = value < 50 ? d.low : d.high;
  const dist = Math.abs(value - 50);
  if (dist < 12) return "balanced";
  if (dist < 30) return `a bit ${end.toLowerCase()}`;
  return `very ${end.toLowerCase()}`;
}

/** Plain-language vibe for prompts. */
export function describeVibe(v: Vibe): string {
  const parts: Record<DialKey, string> = {
    pace: `pace ${dialWords("pace", v.pace)} (${v.pace}/100: low means few plans and long open blocks, high means a full day)`,
    effort: `physical effort ${dialWords("effort", v.effort)} (${v.effort}/100)`,
    path: `${dialWords("path", v.path)} on the iconic-to-hidden-gems scale (${v.path}/100: low favors the famous sights, high favors local, lesser-known spots)`,
    nights: `evenings ${dialWords("nights", v.nights)} (${v.nights}/100: low means early nights, high means nightlife and live music)`,
  };
  return DIALS.map((d) => parts[d.key]).join("; ");
}
