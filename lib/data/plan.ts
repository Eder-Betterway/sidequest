"use client";

import { collection, deleteField, doc, orderBy, setDoc, updateDoc, where, writeBatch, type FirestoreError } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import type { TripInputs } from "@/lib/model/inputs";
import type { Place, PlanItemDraft, StoredDay, StoredItem, StoredOption, TripOption } from "@/lib/model/plan";
import type { PinnedItem } from "@/lib/plan/schedule";
import { planWrites, type Proposal, type ProposalOp } from "@/lib/plan/proposal";
import type { TripProposal } from "@/lib/plan/tripProposal";
import { recordInBatch } from "./history";
import type { HistoryEntry, SavedDay, SavedItem } from "@/lib/model/history";
import type { Vibe, VibeOverride } from "@/lib/plan/vibe";
import type { Usage } from "@/lib/ai/claude";
import { watchCollection } from "./watch";

/**
 * Reads and writes for a trip's plan: wizard answers, options, days, and items.
 * Like everything in lib/data, writes are fire-and-forget so they work offline.
 */

function db() {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase isn't configured");
  return fb.db;
}

const fail = (what: string) => (err: unknown) => console.error(`Sidequest: ${what} failed`, err);

export function saveInputs(tripId: string, inputs: TripInputs, dates: { startDate: string | null; endDate: string | null }) {
  updateDoc(doc(db(), "trips", tripId), { inputs, ...dates, updatedAt: Date.now() }).catch(fail("saving trip details"));
}

// ---------- Options ----------

type OnError = (err: FirestoreError) => void;

export function watchOptions(tripId: string, onData: (rows: (StoredOption & { pending: boolean })[]) => void, onError?: OnError) {
  return watchCollection<StoredOption>(`trips/${tripId}/options`, `options-${tripId}`, [orderBy("createdAt")], onData, onError);
}

/** Replace the trip's options with a fresh set of three. */
export function saveOptions(tripId: string, options: TripOption[], previousIds: string[], me: string) {
  const batch = writeBatch(db());
  for (const id of previousIds) batch.delete(doc(db(), "trips", tripId, "options", id));
  const now = Date.now();
  options.forEach((o, i) => {
    const ref = doc(collection(db(), "trips", tripId, "options"));
    batch.set(ref, { ...o, createdAt: now + i, createdBy: me });
  });
  batch.commit().catch(fail("saving options"));
}

// ---------- Days and items ----------

export function watchDays(tripId: string, onData: (rows: (StoredDay & { id: string; pending: boolean })[]) => void, onError?: OnError) {
  return watchCollection<StoredDay>(`trips/${tripId}/days`, `days-${tripId}`, [orderBy("date")], onData, onError);
}

export function watchItems(tripId: string, onData: (rows: (StoredItem & { pending: boolean })[]) => void, onError?: OnError) {
  return watchCollection<StoredItem>(`trips/${tripId}/items`, `items-${tripId}`, [], onData, onError);
}

export interface ExpandedDay {
  date: string;
  base: string;
  title: string;
  place: Place | null;
  items: PinnedItem[];
}

/**
 * Lay down a whole new plan from an expanded option, replacing the old one.
 * One batch, so the other phone never sees half a plan.
 */
export function replacePlan(
  tripId: string,
  optionId: string,
  days: ExpandedDay[],
  old: { dayIds: string[]; itemIds: string[] },
  plannedVibe: Vibe,
  me: string
) {
  const d = db();
  const batch = writeBatch(d);
  for (const id of old.itemIds) batch.delete(doc(d, "trips", tripId, "items", id));
  for (const id of old.dayIds) batch.delete(doc(d, "trips", tripId, "days", id));
  const now = Date.now();
  for (const day of days) {
    const stored: StoredDay = { date: day.date, base: day.base, title: day.title, place: day.place, updatedAt: now, plannedVibe };
    batch.set(doc(d, "trips", tripId, "days", day.date), stored);
    day.items.forEach((it, order) => {
      const ref = doc(collection(d, "trips", tripId, "items"));
      const item: Omit<StoredItem, "id"> = { ...it, dayDate: day.date, order, updatedAt: now, updatedBy: me };
      batch.set(ref, item);
    });
  }
  batch.update(doc(d, "trips", tripId), { chosenOptionId: optionId, updatedAt: now });
  batch.commit().catch(fail("saving the plan"));
}

export function addItem(tripId: string, dayDate: string, draft: PlanItemDraft, order: number, me: string): string {
  const ref = doc(collection(db(), "trips", tripId, "items"));
  const item: Omit<StoredItem, "id"> = {
    ...draft,
    dayDate,
    order,
    locked: false,
    source: "user",
    milestoneId: null,
    updatedAt: Date.now(),
    updatedBy: me,
  };
  setDoc(ref, item).catch(fail("adding an item"));
  return ref.id;
}

export function updateItem(tripId: string, id: string, patch: Partial<Omit<StoredItem, "id">>, me: string) {
  updateDoc(doc(db(), "trips", tripId, "items", id), { ...patch, updatedAt: Date.now(), updatedBy: me }).catch(
    fail("updating an item")
  );
}

/** Remove an item from the plan; it can be put back from the change history. */
export function deleteItem(tripId: string, item: SavedItem, me: string): HistoryEntry {
  const batch = writeBatch(db());
  batch.delete(doc(db(), "trips", tripId, "items", item.id));
  const entry = recordInBatch(batch, tripId, {
    kind: "delete",
    label: `Removed "${item.title}"`,
    dayDates: [item.dayDate],
    by: me,
    at: Date.now(),
    undo: { addedIds: [], items: [item], days: [] },
  });
  batch.commit().catch(fail("deleting an item"));
  return entry;
}

/** Swap two items' order (move up/down). */
export function swapOrder(tripId: string, a: StoredItem, b: StoredItem, me: string) {
  const batch = writeBatch(db());
  const now = Date.now();
  batch.update(doc(db(), "trips", tripId, "items", a.id), { order: b.order, updatedAt: now, updatedBy: me });
  batch.update(doc(db(), "trips", tripId, "items", b.id), { order: a.order, updatedAt: now, updatedBy: me });
  batch.commit().catch(fail("reordering"));
}

/** What each AI call cost, for keeping an eye on spend. */
export function logAiRun(tripId: string, route: string, usage: Usage | null, me: string) {
  if (!usage) return;
  setDoc(doc(collection(db(), "trips", tripId, "aiRuns")), { route, ...usage, by: me, at: Date.now() }).catch(
    fail("logging AI usage")
  );
}

/**
 * Delete a trip and everything in it. Firestore doesn't cascade deletes, so the
 * plan's records go in the same batch as the trip (the rules check membership
 * on the trip, so they must go first or together).
 */
export function deleteTripWithPlan(
  tripId: string,
  ids: { optionIds: string[]; dayIds: string[]; itemIds: string[]; noteIds?: string[]; draftIds?: string[] }
) {
  const d = db();
  const batch = writeBatch(d);
  for (const id of ids.draftIds ?? []) batch.delete(doc(d, "trips", tripId, "drafts", id));
  for (const id of ids.noteIds ?? []) batch.delete(doc(d, "trips", tripId, "notes", id));
  for (const id of ids.itemIds) batch.delete(doc(d, "trips", tripId, "items", id));
  for (const id of ids.dayIds) batch.delete(doc(d, "trips", tripId, "days", id));
  for (const id of ids.optionIds) batch.delete(doc(d, "trips", tripId, "options", id));
  batch.delete(doc(d, "trips", tripId));
  batch.commit().catch(fail("deleting the trip"));
}

// ---------- Vibe ----------

export function setTripVibe(tripId: string, vibe: Vibe) {
  updateDoc(doc(db(), "trips", tripId), { "inputs.vibe": vibe, updatedAt: Date.now() }).catch(fail("saving the trip vibe"));
}

/** Set this day's overrides, or null to follow the trip's vibe again. */
export function setDayVibe(tripId: string, date: string, override: VibeOverride | null) {
  updateDoc(doc(db(), "trips", tripId, "days", date), {
    vibe: override ?? deleteField(),
    updatedAt: Date.now(),
  }).catch(fail("saving the day's vibe"));
}

// ---------- Proposals ----------

export function watchProposals(tripId: string, onData: (rows: (Proposal & { pending: boolean })[]) => void, onError?: OnError) {
  return watchCollection<Proposal>(`trips/${tripId}/proposals`, `proposals-${tripId}`, [where("status", "==", "pending")], onData, onError);
}

/** Save a suggestion for a day, replacing any earlier pending one for that day. */
export function saveProposal(tripId: string, p: Omit<Proposal, "id" | "status">, previous: string[]): void {
  const batch = writeBatch(db());
  for (const id of previous) batch.update(doc(db(), "trips", tripId, "proposals", id), { status: "dismissed" });
  batch.set(doc(collection(db(), "trips", tripId, "proposals")), { ...p, status: "pending" });
  batch.commit().catch(fail("saving the suggestion"));
}

export function dismissProposal(tripId: string, id: string) {
  updateDoc(doc(db(), "trips", tripId, "proposals", id), { status: "dismissed" }).catch(fail("dismissing the suggestion"));
}

/**
 * Apply the changes the user kept, in one batch (transactions fail offline).
 * Locked items are skipped no matter what the proposal says.
 */
export function acceptProposal(
  tripId: string,
  proposal: Proposal,
  keep: Set<string>,
  dayItems: StoredItem[],
  day: SavedDay,
  plannedVibe: Vibe,
  me: string
): HistoryEntry {
  const d = db();
  const batch = writeBatch(d);
  const now = Date.now();
  const addedIds: string[] = [];
  const before: SavedItem[] = [];
  const byId = new Map(dayItems.map((i) => [i.id, i]));
  const writes = planWrites(proposal.ops as ProposalOp[], keep, dayItems);
  for (const w of writes) {
    if (w.type === "add") {
      const item: Omit<StoredItem, "id"> = {
        ...w.item,
        dayDate: proposal.dayDate,
        order: w.order,
        locked: false,
        source: "ai",
        milestoneId: null,
        updatedAt: now,
        updatedBy: me,
      };
      const ref = doc(collection(d, "trips", tripId, "items"));
      addedIds.push(ref.id);
      batch.set(ref, item);
      continue;
    }
    const was = byId.get(w.itemId);
    if (was) before.push(was);
    if (w.type === "update") {
      batch.update(doc(d, "trips", tripId, "items", w.itemId), { ...w.patch, updatedAt: now, updatedBy: me });
    } else {
      batch.delete(doc(d, "trips", tripId, "items", w.itemId));
    }
  }
  batch.update(doc(d, "trips", tripId, "proposals", proposal.id), { status: "accepted" });
  batch.update(doc(d, "trips", tripId, "days", proposal.dayDate), { plannedVibe, updatedAt: now });
  const entry = recordInBatch(batch, tripId, {
    kind: "suggestion",
    label: `Applied ${writes.length} change${writes.length === 1 ? "" : "s"} to ${proposal.dayDate}`,
    dayDates: [proposal.dayDate],
    by: me,
    at: now,
    undo: { addedIds, items: before, days: [day] },
  });
  batch.commit().catch(fail("applying the suggestion"));
  return entry;
}

// ---------- Trip-wide suggestions and rules ----------

export function watchTripProposals(tripId: string, onData: (rows: (TripProposal & { pending: boolean })[]) => void) {
  return watchCollection<TripProposal>(`trips/${tripId}/tripProposals`, `trip-proposals-${tripId}`, [where("status", "==", "pending")], onData);
}

/** Save a trip-wide suggestion, retiring any earlier pending ones. */
export function saveTripProposal(tripId: string, p: Omit<TripProposal, "id" | "status">, previous: string[]) {
  const batch = writeBatch(db());
  for (const id of previous) batch.update(doc(db(), "trips", tripId, "tripProposals", id), { status: "dismissed" });
  batch.set(doc(collection(db(), "trips", tripId, "tripProposals")), { ...p, status: "pending" });
  batch.commit().catch(fail("saving the trip suggestion"));
}

export function dismissTripProposal(tripId: string, id: string) {
  updateDoc(doc(db(), "trips", tripId, "tripProposals", id), { status: "dismissed" }).catch(fail("dismissing the trip suggestion"));
}

/**
 * Apply the days you kept, in one batch: move the day's base (and its map
 * location) and apply its item changes. Locked items are skipped no matter
 * what the suggestion says.
 */
export function acceptTripProposal(
  tripId: string,
  p: TripProposal,
  keepDates: Set<string>,
  items: StoredItem[],
  days: SavedDay[],
  me: string
): HistoryEntry {
  const d = db();
  const batch = writeBatch(d);
  const now = Date.now();
  const addedIds: string[] = [];
  const beforeItems: SavedItem[] = [];
  const beforeDays: SavedDay[] = [];
  for (const change of p.days) {
    if (!keepDates.has(change.date)) continue;
    const dayBefore = days.find((x) => x.date === change.date);
    if (dayBefore) beforeDays.push(dayBefore);
    const moved = change.after.base !== change.before.base;
    batch.update(doc(d, "trips", tripId, "days", change.date), {
      base: change.after.base,
      title: change.after.title,
      ...(moved ? { place: change.after.place } : {}),
      updatedAt: now,
    });
    const dayItems = items.filter((i) => i.dayDate === change.date);
    const byId = new Map(dayItems.map((i) => [i.id, i]));
    const all = new Set(change.ops.map((o) => o.key));
    for (const w of planWrites(change.ops, all, dayItems)) {
      if (w.type === "add") {
        const item: Omit<StoredItem, "id"> = {
          ...w.item,
          dayDate: change.date,
          order: w.order,
          locked: false,
          source: "ai",
          milestoneId: null,
          updatedAt: now,
          updatedBy: me,
        };
        const ref = doc(collection(d, "trips", tripId, "items"));
        addedIds.push(ref.id);
        batch.set(ref, item);
        continue;
      }
      const was = byId.get(w.itemId);
      if (was) beforeItems.push(was);
      if (w.type === "update") {
        batch.update(doc(d, "trips", tripId, "items", w.itemId), { ...w.patch, updatedAt: now, updatedBy: me });
      } else {
        batch.delete(doc(d, "trips", tripId, "items", w.itemId));
      }
    }
  }
  // The drafts it answered are done.
  for (const id of p.draftIds ?? []) batch.delete(doc(d, "trips", tripId, "drafts", id));
  batch.update(doc(d, "trips", tripId, "tripProposals", p.id), { status: "accepted" });
  const n = beforeDays.length;
  const entry = recordInBatch(batch, tripId, {
    kind: "trip-suggestion",
    label: `Changed ${n} day${n === 1 ? "" : "s"}: "${p.instruction.slice(0, 80)}${p.instruction.length > 80 ? "..." : ""}"`,
    dayDates: beforeDays.map((x) => x.date),
    by: me,
    at: now,
    undo: { addedIds, items: beforeItems, days: beforeDays },
  });
  batch.commit().catch(fail("applying the trip suggestion"));
  return entry;
}

/** Replace the trip's rules (the "keep as a rule" requests). */
export function setRules(tripId: string, rules: string[]) {
  updateDoc(doc(db(), "trips", tripId), { "inputs.rules": rules, updatedAt: Date.now() }).catch(fail("saving trip rules"));
}
