import { placeKey } from "@/lib/model/place";
import type { Place } from "@/lib/model/plan";
import { legKey, legsFor, type LatLng } from "@/lib/model/van";

/**
 * "Get ready for no signal": everything worth saving before a remote
 * stretch. The plan, notes, and trip always live on the phone; this adds the
 * lookups that otherwise only save once you've opened them.
 */

export interface Stop {
  key: string;
  name: string;
  place: Place;
  from: string;
  to: string;
}

export type OfflineTask =
  | { kind: "place"; id: string; stop: Stop }
  | { kind: "spots"; id: string; stop: Stop }
  | { kind: "drive"; id: string; from: LatLng & { name: string }; to: LatLng & { name: string } };

/** Each stay (consecutive days at one base) with a known location, once per place. */
export function stopsOf(days: { date: string; base: string; place: Place | null }[]): Stop[] {
  const stops: Stop[] = [];
  for (const d of days) {
    const last = stops[stops.length - 1];
    if (last && last.name === d.base && last.to < d.date) {
      last.to = d.date;
      continue;
    }
    if (!d.place) continue;
    const key = placeKey(d.base);
    // Saved per place, so a place you come back to is looked up once.
    if (stops.some((s) => s.key === key)) continue;
    stops.push({ key, name: d.base, place: d.place, from: d.date, to: d.date });
  }
  return stops;
}

export interface Saved {
  /** placeKey -> the dates its details were saved for, and whether the write-up is there. */
  places: Map<string, { from: string; to: string; hasWriteUp: boolean }>;
  spots: Set<string>;
  legs: Set<string>;
}

/** What still needs saving, in the order it's most useful. */
export function offlineTasks(
  days: { date: string; base: string; place: Place | null }[],
  opts: { spots: boolean; drives: boolean; writeUps: boolean },
  saved: Saved
): OfflineTask[] {
  const stops = stopsOf(days);
  const tasks: OfflineTask[] = [];
  for (const stop of stops) {
    const have = saved.places.get(stop.key);
    const fresh = have && have.from === stop.from && have.to === stop.to && (have.hasWriteUp || !opts.writeUps);
    if (!fresh) tasks.push({ kind: "place", id: `place:${stop.key}`, stop });
  }
  if (opts.spots) {
    for (const stop of stops) if (!saved.spots.has(`near-${stop.key}`)) tasks.push({ kind: "spots", id: `spots:${stop.key}`, stop });
  }
  if (opts.drives) {
    for (const leg of legsFor(days.map((d) => ({ date: d.date, base: d.base, place: d.place })))) {
      const key = legKey(leg.from.name, leg.to.name);
      if (!saved.legs.has(key)) tasks.push({ kind: "drive", id: `drive:${key}`, from: leg.from, to: leg.to });
    }
  }
  return tasks;
}

export function taskLabel(t: OfflineTask): string {
  if (t.kind === "place") return `${t.stop.name}: details, weather, holidays`;
  if (t.kind === "spots") return `${t.stop.name}: sleep and restock`;
  return `Drive: ${t.from.name} to ${t.to.name}`;
}
