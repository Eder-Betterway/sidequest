"use client";

import { callAi } from "@/lib/ai/client";
import { saveLeg, saveNearby } from "@/lib/data/van";
import type { Vehicle } from "@/lib/model/inputs";
import { placeKey } from "@/lib/model/place";
import { legKey, type DriveLeg, type LatLng, type VanSpot } from "@/lib/model/van";

/** Look up places to sleep and restock near a stop, and save them for offline. */
export async function loadSpots(tripId: string, place: LatLng & { name: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await callAi<{ spots: VanSpot[] }>("/api/van/nearby", { place: { name: place.name, lat: place.lat, lng: place.lng } });
  if (!res.ok) return res;
  saveNearby(tripId, { key: `near-${placeKey(place.name)}`, name: place.name, spots: res.data.spots });
  return { ok: true };
}

/** Look up the drive between two stops for this vehicle, and save it for offline. */
export async function loadLeg(
  tripId: string,
  from: LatLng & { name: string },
  to: LatLng & { name: string },
  vehicle: Vehicle | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await callAi<Omit<DriveLeg, "fromName" | "toName" | "checkedAt">>("/api/van/leg", {
    from: { name: from.name, lat: from.lat, lng: from.lng },
    to: { name: to.name, lat: to.lat, lng: to.lng },
    vehicle,
  });
  if (!res.ok) return res;
  saveLeg(tripId, legKey(from.name, to.name), { ...res.data, fromName: from.name, toName: to.name });
  return { ok: true };
}
