"use client";

import { collection, deleteDoc, doc, setDoc } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import type { ChangeDraftDoc } from "@/lib/model/draft";
import { watchCollection } from "./watch";

/** Draft change requests (`trips/{id}/drafts`). Fire-and-forget, so they save offline. */

function db() {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase isn't configured");
  return fb.db;
}

const fail = (what: string) => (err: unknown) => console.error(`Sidequest: ${what} failed`, err);

export function watchDrafts(tripId: string, onData: (rows: (ChangeDraftDoc & { id: string; pending: boolean })[]) => void, onError?: () => void) {
  return watchCollection<ChangeDraftDoc>(`trips/${tripId}/drafts`, `drafts-${tripId}`, [], onData, onError);
}

export function addDraft(tripId: string, draft: Omit<ChangeDraftDoc, "createdAt">) {
  setDoc(doc(collection(db(), "trips", tripId, "drafts")), { ...draft, createdAt: Date.now() }).catch(fail("saving the draft"));
}

export function deleteDraft(tripId: string, id: string) {
  deleteDoc(doc(db(), "trips", tripId, "drafts", id)).catch(fail("deleting the draft"));
}
