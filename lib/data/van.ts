"use client";

import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import type { DriveLeg, NearbySpots } from "@/lib/model/van";

/**
 * Saved van lookups for a trip (`trips/{id}/van/{key}`): drive legs and spots
 * near each night. Saved so they read with no signal, which is exactly when
 * you're looking for a campsite.
 */

function db() {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase isn't configured");
  return fb.db;
}

function watch<T>(tripId: string, key: string, onData: (row: T | null) => void): () => void {
  const fb = getFirebase();
  if (!fb) return () => {};
  return onSnapshot(
    doc(fb.db, "trips", tripId, "van", key),
    (snap) => onData(snap.exists() ? (snap.data() as T) : null),
    // A brand-new trip may not be readable yet; treat as "nothing saved".
    () => onData(null)
  );
}

const fail = (what: string) => (err: unknown) => console.error(`Sidequest: ${what} failed`, err);

export function watchLeg(tripId: string, key: string, onData: (leg: DriveLeg | null) => void) {
  return watch<DriveLeg>(tripId, key, onData);
}

export function saveLeg(tripId: string, key: string, leg: Omit<DriveLeg, "checkedAt">) {
  setDoc(doc(db(), "trips", tripId, "van", key), { ...leg, checkedAt: Date.now() }).catch(fail("saving the drive"));
}

export function watchNearby(tripId: string, key: string, onData: (n: NearbySpots | null) => void) {
  return watch<NearbySpots>(tripId, key, onData);
}

export function saveNearby(tripId: string, n: Omit<NearbySpots, "fetchedAt">) {
  setDoc(doc(db(), "trips", tripId, "van", n.key), { ...n, fetchedAt: Date.now() }).catch(fail("saving nearby spots"));
}

/** Whether a van lookup (spots near a stop, or a drive) is already saved. */
export async function hasVanDoc(tripId: string, key: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db(), "trips", tripId, "van", key))).exists();
  } catch {
    return false;
  }
}
