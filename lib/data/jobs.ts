"use client";

import { doc, orderBy, updateDoc, where } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import type { AiJobDoc } from "@/lib/model/job";
import { watchCollection } from "./watch";

/** AI jobs the server is working on for a trip (written by the server, as the person who asked). */
export function watchJobs(tripId: string, since: number, onData: (rows: (AiJobDoc & { id: string; pending: boolean })[]) => void) {
  return watchCollection<AiJobDoc>(`trips/${tripId}/jobs`, `jobs-${tripId}`, [where("startedAt", ">=", since), orderBy("startedAt", "desc")], onData);
}

export function dismissJob(tripId: string, id: string) {
  const fb = getFirebase();
  if (!fb) return;
  updateDoc(doc(fb.db, "trips", tripId, "jobs", id), { dismissed: true }).catch((err) => console.error("Sidequest: dismissing the job failed", err));
}
