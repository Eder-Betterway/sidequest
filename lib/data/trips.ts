"use client";

import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  type FirestoreError,
} from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import { buildNewTrip, normalizeEmail, type NewTripInput, type Trip, type TripDoc } from "@/lib/model/trip";
import { syncStore } from "./sync";

/**
 * Every read and write of trip records. Writes never wait for the server:
 * Firestore applies them locally right away and only resolves once the server
 * confirms, which never happens offline. So we fire them and let the live
 * listeners (and the "waiting to sync" count) show what happened.
 */

function db() {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase isn't configured");
  return fb.db;
}

function reportFailure(what: string) {
  return (err: unknown) => console.error(`Sidequest: ${what} failed`, err);
}

/** Live list of trips this email is a member of. Returns an unsubscribe function. */
export function watchTrips(
  email: string,
  onData: (trips: Trip[]) => void,
  onError: (err: FirestoreError) => void
): () => void {
  const key = "trips-list";
  const q = query(collection(db(), "trips"), where("memberEmails", "array-contains", normalizeEmail(email)));
  const stop = onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const trips = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TripDoc), pending: d.metadata.hasPendingWrites }));
      syncStore().report(
        key,
        { pendingWrites: trips.filter((t) => t.pending).length, fromServer: !snap.metadata.fromCache },
        Date.now()
      );
      onData(trips);
    },
    onError
  );
  return () => {
    stop();
    syncStore().forget(key);
  };
}

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

/** Create a trip. Returns its id immediately, online or not. */
export function createTrip(input: NewTripInput, me: string): CreateResult {
  const built = buildNewTrip(input, me, Date.now());
  if (!built.ok) return built;
  const ref = doc(collection(db(), "trips"));
  setDoc(ref, built.trip).catch(reportFailure("saving the trip"));
  return { ok: true, id: ref.id };
}
