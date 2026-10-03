"use client";

import { collection, deleteField, doc, orderBy, setDoc, updateDoc, deleteDoc, where, writeBatch, type FirestoreError } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import type { TripInputs } from "@/lib/model/inputs";
import type { Place, PlanItemDraft, StoredDay, StoredItem, StoredOption, TripOption } from "@/lib/model/plan";
import type { PinnedItem } from "@/lib/plan/schedule";
import { planWrites, type Proposal, type ProposalOp } from "@/lib/plan/proposal";
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

export function deleteItem(tripId: string, id: string) {
  deleteDoc(doc(db(), "trips", tripId, "items", id)).catch(fail("deleting an item"));
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
  ids: { optionIds: string[]; dayIds: string[]; itemIds: string[] }
) {
  const d = db();
  const batch = writeBatch(d);
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
  plannedVibe: Vibe,
  me: string
) {
  const d = db();
  const batch = writeBatch(d);
  const now = Date.now();
  for (const w of planWrites(proposal.ops as ProposalOp[], keep, dayItems)) {
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
      batch.set(doc(collection(d, "trips", tripId, "items")), item);
    } else if (w.type === "update") {
      batch.update(doc(d, "trips", tripId, "items", w.itemId), { ...w.patch, updatedAt: now, updatedBy: me });
    } else {
      batch.delete(doc(d, "trips", tripId, "items", w.itemId));
    }
  }
  batch.update(doc(d, "trips", tripId, "proposals", proposal.id), { status: "accepted" });
  batch.update(doc(d, "trips", tripId, "days", proposal.dayDate), { plannedVibe, updatedAt: now });
  batch.commit().catch(fail("applying the suggestion"));
}
