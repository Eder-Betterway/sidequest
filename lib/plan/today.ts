import { toMinutes } from "@/lib/model/plan";

/**
 * What "Today" shows: where the trip is relative to today, and what's on now
 * and next. Times are the plan's local times, compared with the phone's clock
 * (you're usually standing in the place you're planning).
 */

export type Phase = "undated" | "before" | "during" | "after";

export function tripPhase(trip: { startDate: string | null; endDate: string | null }, today: string): Phase {
  if (!trip.startDate || !trip.endDate) return "undated";
  if (today < trip.startDate) return "before";
  if (today > trip.endDate) return "after";
  return "during";
}

/** Whole days from `from` to `to` (dates as YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

const DEFAULT_MINUTES = 60;

export function nowAndNext<T extends { start: string | null; end: string | null }>(
  items: T[],
  nowMin: number
): { current: T | null; next: T | null; later: T[]; anytime: T[] } {
  const timed = items.filter((i) => toMinutes(i.start) !== null).sort((a, b) => toMinutes(a.start)! - toMinutes(b.start)!);
  const anytime = items.filter((i) => toMinutes(i.start) === null);
  const endOf = (i: T) => toMinutes(i.end) ?? toMinutes(i.start)! + DEFAULT_MINUTES;
  const current = [...timed].reverse().find((i) => toMinutes(i.start)! <= nowMin && nowMin < endOf(i)) ?? null;
  const upcoming = timed.filter((i) => toMinutes(i.start)! > nowMin);
  return { current, next: upcoming[0] ?? null, later: upcoming.slice(1), anytime };
}

/** "in 45 min", "in 2h 10m". */
export function untilText(minutes: number): string {
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}
