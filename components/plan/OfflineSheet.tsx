"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Toggle } from "@/components/ui/fields";
import { useOnline } from "@/components/shell/useOnline";
import { loadPlace } from "@/components/place/loadPlace";
import { loadLeg, loadSpots } from "@/components/van/load";
import { readTripPlaceInfo } from "@/lib/data/places";
import { hasVanDoc } from "@/lib/data/van";
import type { TripInputs } from "@/lib/model/inputs";
import type { Trip } from "@/lib/model/trip";
import { legKey, legsFor } from "@/lib/model/van";
import { offlineTasks, stopsOf, taskLabel, type OfflineTask, type Saved } from "@/lib/plan/offline";
import type { PlanState } from "./usePlan";

const LAST_KEY = "sidequest_offline_ready_";

/** When this phone last got a trip ready for no signal. */
export function lastReady(tripId: string): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_KEY + tripId));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * One tap before a remote stretch: look up and save every stop's details,
 * weather, and holidays, places to sleep and restock, and the drives, so
 * they all open in airplane mode. Skips what's already saved.
 */
export default function OfflineSheet({
  trip,
  inputs,
  plan,
  email,
  onClose,
}: {
  trip: Trip;
  inputs: TripInputs;
  plan: PlanState;
  email: string;
  onClose: () => void;
}) {
  const online = useOnline();
  const van = inputs.modes.includes("campervan");
  const drives = van || inputs.modes.includes("car");
  const [writeUps, setWriteUps] = useState(true);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [running, setRunning] = useState<{ done: number; total: number; label: string } | null>(null);
  const [failed, setFailed] = useState<{ task: OfflineTask; error: string }[]>([]);
  const [finished, setFinished] = useState<number | null>(null);

  const stops = stopsOf(plan.days);

  // What's already on the phone, so nothing is fetched (or paid for) twice.
  async function check(): Promise<Saved> {
    const places: Saved["places"] = new Map();
    const spots = new Set<string>();
    const legs = new Set<string>();
    await Promise.all([
      ...stops.map(async (s) => {
        const info = await readTripPlaceInfo(trip.id, s.key);
        if (info) places.set(s.key, { from: info.from, to: info.to, hasWriteUp: Boolean(info.info) });
        if (van && (await hasVanDoc(trip.id, `near-${s.key}`))) spots.add(`near-${s.key}`);
      }),
      ...(drives
        ? legsFor(plan.days.map((d) => ({ date: d.date, base: d.base, place: d.place }))).map(async (l) => {
            const key = legKey(l.from.name, l.to.name);
            if (await hasVanDoc(trip.id, key)) legs.add(key);
          })
        : []),
    ]);
    return { places, spots, legs };
  }

  useEffect(() => {
    let live = true;
    void check().then((s) => live && setSaved(s));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.days]);

  const tasks = saved ? offlineTasks(plan.days, { spots: van, drives, writeUps }, saved) : [];

  async function run(list: OfflineTask[]) {
    setFailed([]);
    setFinished(null);
    // Ask the browser not to clear this app's storage when space runs low.
    void navigator.storage?.persist?.();
    const errors: { task: OfflineTask; error: string }[] = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      setRunning({ done: i, total: list.length, label: taskLabel(t) });
      const res =
        t.kind === "place"
          ? await loadPlace({
              trip,
              inputs,
              target: { name: t.stop.name, lat: t.stop.place.lat, lng: t.stop.place.lng, timezone: t.stop.place.timezone, countryCode: t.stop.place.countryCode ?? null },
              from: t.stop.from,
              to: t.stop.to,
              email,
              withWriteUp: writeUps,
            })
          : t.kind === "spots"
            ? await loadSpots(trip.id, { name: t.stop.name, lat: t.stop.place.lat, lng: t.stop.place.lng })
            : await loadLeg(trip.id, t.from, t.to, inputs.vehicle);
      if (!res.ok) errors.push({ task: t, error: res.error });
    }
    setRunning(null);
    setFailed(errors);
    const at = Date.now();
    try {
      localStorage.setItem(LAST_KEY + trip.id, String(at));
    } catch {
      // fine
    }
    setFinished(list.length - errors.length);
    setSaved(await check());
  }

  const placeTasks = tasks.filter((t) => t.kind === "place").length;
  const spotTasks = tasks.filter((t) => t.kind === "spots").length;
  const driveTasks = tasks.filter((t) => t.kind === "drive").length;

  return (
    <Sheet title="Get ready for no signal" onClose={onClose}>
      <div className="space-y-4 pb-2">
        <p className="text-sm leading-relaxed text-muted">
          Your plan, notes, and trip are always on this phone. This also saves each stop&apos;s details, weather, and holidays
          {van ? ", places to sleep and restock," : ""}
          {drives ? " and the drives" : ""} so they open in airplane mode.
        </p>

        {!saved ? (
          <p className="text-sm text-muted">Checking what&apos;s already saved...</p>
        ) : running ? (
          <div role="status" aria-label="Saving for offline">
            <p className="text-sm font-medium">
              Saving {running.done + 1} of {running.total}
            </p>
            <p className="text-sm text-muted">{running.label}</p>
            <div className="mt-2 h-2 rounded-full bg-surface-2">
              <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.round((running.done / running.total) * 100)}%` }} />
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-3 text-sm font-medium">
            {finished !== null ? `Done. Saved ${finished}.` : "Already ready."} Everything for {stops.length} {stops.length === 1 ? "stop" : "stops"} is on this phone.
          </p>
        ) : (
          <>
            <ul className="space-y-1 text-sm">
              {placeTasks > 0 && <li>Details, weather, and holidays for {placeTasks} {placeTasks === 1 ? "stop" : "stops"}</li>}
              {spotTasks > 0 && <li>Sleep and restock for {spotTasks} {spotTasks === 1 ? "stop" : "stops"}</li>}
              {driveTasks > 0 && <li>{driveTasks} {driveTasks === 1 ? "drive" : "drives"}</li>}
            </ul>
            <Toggle
              label={`Include AI write-ups (about $${(placeTasks * 0.1).toFixed(2)})`}
              checked={writeUps}
              onChange={setWriteUps}
            />
            <button
              type="button"
              onClick={() => void run(tasks)}
              disabled={!online}
              className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
            >
              {online ? `Save ${tasks.length} ${tasks.length === 1 ? "thing" : "things"}` : "Needs signal"}
            </button>
            <p className="text-center text-xs text-muted">Keep the app open while it saves; it takes a few seconds per stop.</p>
          </>
        )}

        {failed.length > 0 && !running && (
          <div role="alert" className="rounded-xl border border-warn/40 p-3 text-sm">
            <p className="font-medium text-warn">{failed.length} didn&apos;t save:</p>
            <ul className="mt-1 space-y-1">
              {failed.map((f) => (
                <li key={f.task.id}>
                  {taskLabel(f.task)} <span className="text-muted">({f.error})</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => void run(failed.map((f) => f.task))} disabled={!online} className="mt-2 min-h-11 font-semibold text-accent">
              Try those again
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
