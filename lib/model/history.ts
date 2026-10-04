import type { StoredDay, StoredItem } from "./plan";

/**
 * A trip's change history (`trips/{id}/history`): every applied suggestion,
 * flyer, or deleted item, with what it takes to undo it. Also feeds "what
 * changed since you last looked".
 */

export type SavedItem = Omit<StoredItem, "pending">;
export type SavedDay = StoredDay & { id: string };

export interface UndoData {
  /** Items the change created: removed on undo. */
  addedIds: string[];
  /** Items as they were before (edited or removed by the change): put back on undo. */
  items: SavedItem[];
  /** Days as they were before (base, title, place). */
  days: SavedDay[];
}

export interface HistoryDoc {
  kind: "suggestion" | "trip-suggestion" | "flyer" | "delete" | "undo";
  label: string;
  dayDates: string[];
  by: string;
  at: number;
  undo: UndoData | null;
  undoneAt?: number | null;
  undoneBy?: string | null;
}

export interface HistoryEntry extends HistoryDoc {
  id: string;
}

/** Firestore refuses undefined values; drop them (and local-only fields) before saving a snapshot. */
export function clean<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && k !== "pending") out[k] = v;
  return out as T;
}

export function canUndo(e: Pick<HistoryDoc, "undo" | "undoneAt">): boolean {
  return Boolean(e.undo) && !e.undoneAt;
}

/**
 * What's been touched since the change, so undo can warn before overwriting
 * someone's later edits.
 */
export function undoConflicts(
  e: Pick<HistoryDoc, "undo" | "at">,
  items: Pick<StoredItem, "id" | "title" | "updatedAt">[],
  days: Pick<StoredDay, "date" | "updatedAt">[]
): string[] {
  if (!e.undo) return [];
  const touched = new Set([...e.undo.addedIds, ...e.undo.items.map((i) => i.id)]);
  const later = items.filter((i) => touched.has(i.id) && i.updatedAt > e.at + 1000).map((i) => i.title);
  const dayDates = new Set(e.undo.days.map((d) => d.date));
  const laterDays = days.filter((d) => dayDates.has(d.date) && d.updatedAt > e.at + 1000).map((d) => `the plan for ${d.date}`);
  return [...later, ...laterDays];
}

export interface FeedEntry {
  at: number;
  by: string;
  text: string;
}

const SAME_CHANGE_MS = 5000;

/**
 * Changes by the other person since you last looked: applied suggestions and
 * other history, items they edited, and notes they added. Newest first.
 */
export function changesSince(
  lastSeen: number,
  me: string,
  history: Pick<HistoryDoc, "by" | "at" | "label">[],
  items: Pick<StoredItem, "title" | "updatedAt" | "updatedBy" | "dayDate">[],
  notes: { kind: string; text: string; createdBy: string; createdAt: number }[]
): FeedEntry[] {
  const self = me.trim().toLowerCase();
  const theirs = history.filter((h) => h.by !== self && h.at > lastSeen);
  const feed: FeedEntry[] = theirs.map((h) => ({ at: h.at, by: h.by, text: h.label }));
  for (const i of items) {
    if (i.updatedBy === self || i.updatedAt <= lastSeen) continue;
    // Part of a change already listed (an applied suggestion touches many items).
    if (theirs.some((h) => h.by === i.updatedBy && Math.abs(h.at - i.updatedAt) < SAME_CHANGE_MS)) continue;
    feed.push({ at: i.updatedAt, by: i.updatedBy, text: `Edited "${i.title}" on ${i.dayDate}` });
  }
  for (const n of notes) {
    if (n.createdBy === self || n.createdAt <= lastSeen) continue;
    const what = n.kind === "question" ? "Asked" : n.kind === "flyer" ? "Snapped a flyer" : `Added a ${n.kind}`;
    feed.push({ at: n.createdAt, by: n.createdBy, text: n.text ? `${what}: "${n.text.slice(0, 80)}"` : what });
  }
  return feed.sort((a, b) => b.at - a.at).slice(0, 20);
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function ago(at: number, now: number): string {
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** The start of an email, for showing who did something. */
export function who(email: string, me: string): string {
  return email === me.trim().toLowerCase() ? "You" : email.split("@")[0];
}
