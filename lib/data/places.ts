"use client";

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import type { CachedPlace, TripPlaceInfo } from "@/lib/model/place";
import type { Usage } from "@/lib/ai/claude";
import { logAiRun } from "./plan";

/**
 * Place deep-dive storage, so a place you've looked at reads offline later:
 * - `places/{key}`: trip-independent facts (Wikipedia), shared across trips.
 * - `trips/{id}/placeInfo/{key}`: the AI write-up, weather, and holidays for
 *   this trip's dates and interests.
 */

function db() {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase isn't configured");
  return fb.db;
}

const fail = (what: string) => (err: unknown) => console.error(`Sidequest: ${what} failed`, err);

function watchDoc<T>(path: string[], onData: (row: T | null) => void): () => void {
  const fb = getFirebase();
  if (!fb) return () => {};
  return onSnapshot(
    doc(fb.db, path[0], ...path.slice(1)),
    (snap) => onData(snap.exists() ? (snap.data() as T) : null),
    // A brand-new trip may not be readable yet; treat as "nothing cached".
    () => onData(null)
  );
}

export function watchCachedPlace(key: string, onData: (p: CachedPlace | null) => void) {
  return watchDoc<CachedPlace>(["places", key], onData);
}

export function saveCachedPlace(p: CachedPlace) {
  setDoc(doc(db(), "places", p.key), p).catch(fail("caching the place"));
}

export function watchTripPlaceInfo(tripId: string, key: string, onData: (p: TripPlaceInfo | null) => void) {
  return watchDoc<TripPlaceInfo>(["trips", tripId, "placeInfo", key], onData);
}

export function saveTripPlaceInfo(tripId: string, info: TripPlaceInfo, usage: Usage | null, me: string) {
  setDoc(doc(db(), "trips", tripId, "placeInfo", info.key), info).catch(fail("saving the place details"));
  logAiRun(tripId, "place", usage, me);
}
