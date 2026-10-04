"use client";

import { useEffect, useRef, useState } from "react";
import { useOnline } from "@/components/shell/useOnline";
import { useNow } from "@/components/shell/useNow";
import { callAi } from "@/lib/ai/client";
import { saveLeg, watchLeg } from "@/lib/data/van";
import type { TripInputs } from "@/lib/model/inputs";
import {
  estimateLeg,
  formatDistance,
  formatHours,
  legFlags,
  legKey,
  routeProfile,
  type DriveLeg,
  type LatLng,
} from "@/lib/model/van";

type Stop = LatLng & { name: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The drive into today's base: time, distance, and heads-ups from your own
 * limits. Shows a rough estimate right away, then real routing once there's
 * signal, and keeps it for offline.
 */
export default function DriveLegCard({ tripId, from, to, inputs }: { tripId: string; from: Stop; to: Stop; inputs: TripInputs }) {
  const online = useOnline();
  const now = useNow(60_000);
  const key = legKey(from.name, to.name);
  const [saved, setSaved] = useState<DriveLeg | null | undefined>(undefined);
  const tried = useRef(false);
  const wanted = routeProfile(inputs.vehicle);

  useEffect(() => watchLeg(tripId, key, setSaved), [tripId, key]);

  // Routed for this van already, or an estimate checked recently: nothing to do.
  const current = saved && (saved.profile === wanted || (saved.source === "estimate" && now - saved.checkedAt < DAY_MS));
  useEffect(() => {
    if (saved === undefined || current || !online || tried.current) return;
    tried.current = true;
    void (async () => {
      const res = await callAi<Omit<DriveLeg, "fromName" | "toName" | "checkedAt">>("/api/van/leg", {
        from,
        to,
        vehicle: inputs.vehicle,
      });
      if (res.ok) saveLeg(tripId, key, { ...res.data, fromName: from.name, toName: to.name });
    })();
  }, [saved, current, online, tripId, key, from, to, inputs.vehicle]);

  const leg = saved ?? { ...estimateLeg(from, to), source: "estimate" as const };
  const flags = legFlags(leg, inputs);
  const directions = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;

  return (
    <div className="mt-3 rounded-xl bg-surface-2 p-3" aria-label="Drive in">
      <p className="text-sm">
        <span className="font-semibold">Drive in from {from.name}</span>
        <span className="block text-muted">
          {formatHours(leg.hours)} · {formatDistance(leg.km, inputs.units)}
          {leg.source === "estimate" ? " · rough estimate" : ""}
        </span>
      </p>
      {flags.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {flags.map((f) => (
            <li key={f.text} className={f.level === "warn" ? "font-medium text-warn" : "text-muted"}>
              {f.text}
            </li>
          ))}
        </ul>
      )}
      <a href={directions} target="_blank" rel="noreferrer" className="mt-1 inline-block min-h-9 text-xs font-medium text-accent">
        Directions ›
      </a>
    </div>
  );
}
