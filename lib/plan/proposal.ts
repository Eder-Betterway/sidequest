import type { PlanItemDraft, StoredItem } from "@/lib/model/plan";

/**
 * Proposals: AI suggestions shown as a list of changes you accept or skip.
 * The AI never writes to the plan directly, and locked items are never touched.
 */

type Fields = Pick<PlanItemDraft, "kind" | "title" | "start" | "end" | "place" | "notes">;

export type ProposalOp =
  | { op: "add"; key: string; item: Fields }
  | { op: "remove"; key: string; itemId: string; title: string }
  | { op: "update"; key: string; itemId: string; before: Fields; after: Fields };

export interface Proposal {
  id: string;
  dayDate: string;
  reason: string;
  summary: string;
  ops: ProposalOp[];
  /** updatedAt of every item the proposal was based on, to detect stale suggestions. */
  basedOn: Record<string, number>;
  status: "pending" | "accepted" | "dismissed";
  createdBy: string;
  createdAt: number;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const fields = (i: Fields): Fields => ({
  kind: i.kind,
  title: i.title,
  start: i.start,
  end: i.end,
  place: i.place,
  notes: i.notes,
});
const same = (a: Fields, b: Fields) =>
  a.kind === b.kind && a.title === b.title && a.start === b.start && a.end === b.end && a.place === b.place && a.notes === b.notes;

/**
 * Compare a day's current unlocked items with the AI's suggested set and
 * produce the smallest list of changes. Items match by title.
 */
export function diffDay(current: StoredItem[], proposed: PlanItemDraft[], lockedTitles: string[] = []): ProposalOp[] {
  const unlocked = current.filter((i) => !i.locked);
  const locked = new Set([...current.filter((i) => i.locked).map((i) => norm(i.title)), ...lockedTitles.map(norm)]);
  // The AI was told locked items are fixed; drop any copies it echoed back.
  const suggestions = proposed.filter((p) => !locked.has(norm(p.title)));

  const ops: ProposalOp[] = [];
  const used = new Set<string>();
  suggestions.forEach((p, n) => {
    const match = unlocked.find((c) => !used.has(c.id) && norm(c.title) === norm(p.title));
    if (match) {
      used.add(match.id);
      if (!same(fields(match), fields(p))) {
        ops.push({ op: "update", key: `u${n}`, itemId: match.id, before: fields(match), after: fields(p) });
      }
    } else {
      ops.push({ op: "add", key: `a${n}`, item: fields(p) });
    }
  });
  unlocked
    .filter((c) => !used.has(c.id))
    .forEach((c, n) => ops.push({ op: "remove", key: `r${n}`, itemId: c.id, title: c.title }));
  return ops;
}

/** The plan moved on since the suggestion: an item it relied on was edited or removed. */
export function isStale(p: Pick<Proposal, "basedOn">, items: Pick<StoredItem, "id" | "updatedAt">[]): boolean {
  const byId = new Map(items.map((i) => [i.id, i.updatedAt]));
  return Object.entries(p.basedOn).some(([id, at]) => byId.get(id) !== at);
}

export type Write =
  | { type: "add"; item: Fields; order: number }
  | { type: "update"; itemId: string; patch: Fields }
  | { type: "delete"; itemId: string };

/**
 * Turn the ops the user kept into writes. Refuses anything that would touch a
 * locked item, even if a stale or tampered proposal asks for it.
 */
export function planWrites(ops: ProposalOp[], keep: Set<string>, items: StoredItem[]): Write[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  let nextOrder = items.reduce((m, i) => Math.max(m, i.order), -1) + 1;
  const writes: Write[] = [];
  for (const op of ops) {
    if (!keep.has(op.key)) continue;
    if (op.op === "add") {
      writes.push({ type: "add", item: op.item, order: nextOrder++ });
      continue;
    }
    const target = byId.get(op.itemId);
    if (!target || target.locked) continue;
    writes.push(op.op === "remove" ? { type: "delete", itemId: op.itemId } : { type: "update", itemId: op.itemId, patch: op.after });
  }
  return writes;
}
