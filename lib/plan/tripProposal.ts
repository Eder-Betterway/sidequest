import type { DayDraft, Place, StoredDay, StoredItem } from "@/lib/model/plan";
import { diffDay, type ProposalOp } from "./proposal";

/**
 * A suggestion that spans several days (from "change the trip" requests):
 * where you sleep may move, and each changed day carries its own list of
 * item changes. You accept or skip it day by day. Locked items never move.
 */

export interface TripDayChange {
  date: string;
  before: { base: string; title: string };
  after: { base: string; title: string; place: Place | null };
  ops: ProposalOp[];
}

export interface TripProposal {
  id: string;
  instruction: string;
  /** Asked from this day, or null for the whole trip. */
  focusDate: string | null;
  summary: string;
  days: TripDayChange[];
  /** updatedAt of each affected day ("day:<date>") and item, to spot stale suggestions. */
  basedOn: Record<string, number>;
  status: "pending" | "accepted" | "dismissed";
  /** Draft changes this came from; they're cleared once it's applied. */
  draftIds?: string[];
  createdBy: string;
  createdAt: number;
}

export type ChangedDay = DayDraft & { place: Place | null };

/** Turn the planner's changed days into per-day changes, dropping days that end up the same. */
export function buildTripChanges(
  days: Pick<StoredDay, "date" | "base" | "title" | "updatedAt">[],
  items: StoredItem[],
  changed: ChangedDay[]
): { changes: TripDayChange[]; basedOn: Record<string, number> } {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const changes: TripDayChange[] = [];
  const basedOn: Record<string, number> = {};
  for (const c of changed) {
    const day = byDate.get(c.date);
    if (!day) continue;
    const dayItems = items.filter((i) => i.dayDate === c.date);
    const ops = diffDay(dayItems, c.items);
    const moved = c.base !== day.base;
    if (!moved && c.title === day.title && ops.length === 0) continue;
    changes.push({
      date: c.date,
      before: { base: day.base, title: day.title },
      // A day that stays put keeps its known location.
      after: { base: c.base, title: c.title, place: moved ? c.place : null },
      ops,
    });
    basedOn[`day:${c.date}`] = day.updatedAt;
    for (const i of dayItems) basedOn[i.id] = i.updatedAt;
  }
  changes.sort((a, b) => a.date.localeCompare(b.date));
  return { changes, basedOn };
}

/** Something it relied on was edited since: a day or one of its items. */
export function tripStale(
  p: Pick<TripProposal, "basedOn">,
  days: Pick<StoredDay, "date" | "updatedAt">[],
  items: Pick<StoredItem, "id" | "updatedAt">[]
): boolean {
  const now = new Map<string, number>([...days.map((d) => [`day:${d.date}`, d.updatedAt] as const), ...items.map((i) => [i.id, i.updatedAt] as const)]);
  return Object.entries(p.basedOn).some(([k, at]) => now.get(k) !== at);
}
