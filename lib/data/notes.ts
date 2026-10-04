"use client";

import { collection, deleteDoc, doc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import type { PlanItemDraft, StoredItem } from "@/lib/model/plan";
import type { FlyerEvent, NoteAnswer, NoteDoc } from "@/lib/model/note";
import type { Usage } from "@/lib/ai/claude";
import { logAiRun } from "./plan";
import { watchCollection } from "./watch";
import { recordInBatch } from "./history";
import type { HistoryEntry } from "@/lib/model/history";

/**
 * Notes, tips, questions, and flyers for a trip (`trips/{id}/notes`). Writes
 * are fire-and-forget like the rest of lib/data, so capture works offline.
 */

function db() {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase isn't configured");
  return fb.db;
}

const fail = (what: string) => (err: unknown) => console.error(`Sidequest: ${what} failed`, err);

export function watchNotes(tripId: string, onData: (rows: (NoteDoc & { id: string; pending: boolean })[]) => void, onError?: () => void) {
  return watchCollection<NoteDoc>(`trips/${tripId}/notes`, `notes-${tripId}`, [], onData, onError);
}

export function addNote(tripId: string, note: NoteDoc): string {
  const ref = doc(collection(db(), "trips", tripId, "notes"));
  setDoc(ref, note).catch(fail("saving the note"));
  return ref.id;
}

export function updateNote(tripId: string, id: string, patch: Partial<NoteDoc>) {
  updateDoc(doc(db(), "trips", tripId, "notes", id), { ...patch, updatedAt: Date.now() }).catch(fail("updating the note"));
}

export function deleteNote(tripId: string, id: string) {
  deleteDoc(doc(db(), "trips", tripId, "notes", id)).catch(fail("deleting the note"));
}

export function saveAnswer(tripId: string, id: string, answer: Omit<NoteAnswer, "answeredAt">, usage: Usage | null, me: string) {
  updateNote(tripId, id, { answer: { ...answer, answeredAt: Date.now() } });
  logAiRun(tripId, "ask", usage, me);
}

/** It became a plan suggestion for this day. */
export function markNoteUsed(tripId: string, id: string, dayDate: string) {
  updateNote(tripId, id, { usedAt: Date.now(), dayDate });
}

/** Keep what was read off a flyer and drop the photo, so the record stays small. */
export function saveFlyerEvents(tripId: string, id: string, events: FlyerEvent[], usage: Usage | null, me: string) {
  updateNote(tripId, id, { events, photo: null });
  logAiRun(tripId, "flyer", usage, me);
}

/**
 * Put the flyer events you picked onto their days, in one batch, and mark the
 * flyer used. Items are yours (source "user"): you chose them.
 */
export function addFlyerEventsToPlan(
  tripId: string,
  noteId: string,
  picks: { dayDate: string; item: PlanItemDraft }[],
  items: Pick<StoredItem, "dayDate" | "order">[],
  me: string
): HistoryEntry {
  const d = db();
  const batch = writeBatch(d);
  const now = Date.now();
  const next = new Map<string, number>();
  const addedIds: string[] = [];
  for (const { dayDate, item } of picks) {
    const order = next.get(dayDate) ?? items.filter((i) => i.dayDate === dayDate).reduce((m, i) => Math.max(m, i.order), -1) + 1;
    next.set(dayDate, order + 1);
    const stored: Omit<StoredItem, "id"> = {
      ...item,
      dayDate,
      order,
      locked: false,
      source: "user",
      milestoneId: null,
      updatedAt: now,
      updatedBy: me,
    };
    const ref = doc(collection(d, "trips", tripId, "items"));
    addedIds.push(ref.id);
    batch.set(ref, stored);
  }
  batch.update(doc(d, "trips", tripId, "notes", noteId), { usedAt: now, updatedAt: now });
  const entry = recordInBatch(batch, tripId, {
    kind: "flyer",
    label: `Added ${picks.length} event${picks.length === 1 ? "" : "s"} from a flyer`,
    dayDates: [...new Set(picks.map((p) => p.dayDate))],
    by: me,
    at: now,
    undo: { addedIds, items: [], days: [] },
  });
  batch.commit().catch(fail("adding flyer events to the plan"));
  return entry;
}
