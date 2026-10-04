"use client";

import { useEffect, useRef, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useOnline } from "@/components/shell/useOnline";
import { callAi } from "@/lib/ai/client";
import { saveNearby, watchNearby } from "@/lib/data/van";
import type { TripInputs } from "@/lib/model/inputs";
import { placeKey } from "@/lib/model/place";
import {
  formatDistance,
  formatLength,
  mapsPinUrl,
  recreationGovUrl,
  SPOT_KINDS,
  tooLong,
  type NearbySpots,
  type SpotKind,
  type VanSpot,
} from "@/lib/model/van";

const HEADINGS: Record<SpotKind, string> = { camp: "Places to sleep", water: "Water", dump: "Dump stations" };

/**
 * Where to sleep and restock near tonight's base: campsites, water fills, and
 * dump stations from OpenStreetMap. Saved for offline. Map data on fees and
 * limits is patchy, so it says so.
 */
export default function VanSheet({
  tripId,
  inputs,
  place,
  onClose,
}: {
  tripId: string;
  inputs: TripInputs;
  place: { name: string; lat: number; lng: number; countryCode: string | null };
  onClose: () => void;
}) {
  const online = useOnline();
  const key = `near-${placeKey(place.name)}`;
  const [saved, setSaved] = useState<NearbySpots | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => watchNearby(tripId, key, setSaved), [tripId, key]);

  async function load() {
    setBusy(true);
    setError(null);
    const res = await callAi<{ spots: VanSpot[] }>("/api/van/nearby", { place: { name: place.name, lat: place.lat, lng: place.lng } });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    saveNearby(tripId, { key, name: place.name, spots: res.data.spots });
  }

  useEffect(() => {
    if (saved !== null || !online || tried.current) return;
    tried.current = true;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, online]);

  const units = inputs.units;
  const spots = saved?.spots ?? [];

  return (
    <Sheet title={`Sleep and restock near ${place.name}`} onClose={onClose}>
      <div className="space-y-5 pb-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {saved && (
            <button type="button" onClick={load} disabled={busy || !online} className="min-h-11 font-medium text-accent disabled:opacity-50">
              {busy ? "Refreshing..." : "Refresh"}
            </button>
          )}
          {place.countryCode === "US" && (
            <a href={recreationGovUrl(place.name)} target="_blank" rel="noreferrer" className="min-h-11 py-3 font-medium text-accent">
              Recreation.gov campgrounds ›
            </a>
          )}
        </div>

        {busy && !saved && <p className="text-sm text-muted">Searching the map around {place.name}...</p>}
        {!online && !saved && <p className="text-sm text-warn">This needs signal the first time. After that it works offline.</p>}
        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}

        {saved &&
          SPOT_KINDS.map((kind) => {
            const list = spots.filter((s) => s.kind === kind);
            return (
              <section key={kind} aria-label={HEADINGS[kind]}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{HEADINGS[kind]}</h3>
                {list.length === 0 ? (
                  <p className="text-sm text-muted">None on the map nearby. Ask locally, or check an app like iOverlander.</p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((s) => (
                      <SpotRow key={s.id} spot={s} units={units} tooLong={tooLong(s, inputs.vehicle)} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

        <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
          From OpenStreetMap, shared by travelers. Fees, limits, and closures change: check signs and limits before you commit.
        </p>
      </div>
    </Sheet>
  );
}

function SpotRow({ spot, units, tooLong }: { spot: VanSpot; units: "imperial" | "metric"; tooLong: boolean }) {
  const bits = [
    `${formatDistance(spot.km, units)} away`,
    spot.fee === true ? "Fee" : spot.fee === false ? "Free" : null,
    spot.maxLengthM ? `Max ${formatLength(spot.maxLengthM, units)}` : null,
    ...spot.facts,
  ].filter(Boolean);
  return (
    <li className="rounded-xl border border-border p-3 text-sm">
      {spot.url ? (
        <a href={spot.url} target="_blank" rel="noreferrer" className="font-medium text-accent">
          {spot.name}
        </a>
      ) : (
        <span className="font-medium">{spot.name}</span>
      )}
      <span className="block text-xs text-muted">{bits.join(" · ")}</span>
      {tooLong && <span className="block text-xs font-medium text-warn">Posted limit is shorter than your van.</span>}
      <a href={mapsPinUrl(spot)} target="_blank" rel="noreferrer" className="mt-1 inline-block min-h-9 text-xs font-medium text-accent">
        Open in Maps ›
      </a>
    </li>
  );
}
