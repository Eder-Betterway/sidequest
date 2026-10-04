"use client";

import { collection, doc, limit, orderBy, writeBatch, type WriteBatch } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import { clean, type HistoryDoc, type HistoryEntry } from "@/lib/model/history";
import { watchCollection } from "./watch";

function db() {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase isn't configured");
  return fb.db;
}

const fail = (what: string) => (err: unknown) => console.error(`Sidequest: ${what} failed`, err);

export function watchHistory(tripId: string, onData: (rows: HistoryEntry[]) => void) {
  return watchCollection<HistoryDoc>(`trips/${tripId}/history`, `history-${tripId}`, [orderBy("at", "desc"), limit(50)], onData);
}

/** Add a history entry to a batch that's making the change, so both land together. */
export function recordInBatch(batch: WriteBatch, tripId: string, entry: HistoryDoc): HistoryEntry {
  const ref = doc(collection(db(), "trips", tripId, "history"));
  const saved: HistoryDoc = {
    ...entry,
    undo: entry.undo
      ? { addedIds: entry.undo.addedIds, items: entry.undo.items.map(clean), days: entry.undo.days.map(clean) }
      : null,
  };
  batch.set(ref, saved);
  return { ...saved, id: ref.id };
}

/**
 * Put things back the way they were before a change: remove what it added,
 * restore what it edited or removed (stamped as your edit, so open
 * suggestions notice), and restore the days. Logged as its own change.
 */
export function undoChange(tripId: string, entry: HistoryEntry, me: string) {
  if (!entry.undo || entry.undoneAt) return;
  const d = db();
  const batch = writeBatch(d);
  const now = Date.now();
  for (const id of entry.undo.addedIds) batch.delete(doc(d, "trips", tripId, "items", id));
  for (const { id, ...item } of entry.undo.items) {
    batch.set(doc(d, "trips", tripId, "items", id), { ...item, updatedAt: now, updatedBy: me });
  }
  for (const { id, ...day } of entry.undo.days) {
    batch.set(doc(d, "trips", tripId, "days", id), { ...day, updatedAt: now });
  }
  batch.update(doc(d, "trips", tripId, "history", entry.id), { undoneAt: now, undoneBy: me });
  recordInBatch(batch, tripId, { kind: "undo", label: `Undid: ${entry.label}`, dayDates: entry.dayDates, by: me, at: now, undo: null });
  batch.commit().catch(fail("undoing the change"));
}
