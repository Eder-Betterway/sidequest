"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { setTripVibe } from "@/lib/data/plan";
import type { TripInputs } from "@/lib/model/inputs";
import { sortItems } from "@/lib/model/plan";
import type { Trip } from "@/lib/model/trip";
import { effectiveVibe, vibeChanged, type Vibe } from "@/lib/plan/vibe";
import { useOnline } from "@/components/shell/useOnline";
import VibeDials from "./VibeDials";
import { replanDay } from "./replan";
import type { PlanState } from "./usePlan";

/**
 * Set the whole trip's vibe. Days follow it unless they have their own
 * overrides. Afterwards, offer to re-plan every day the change affects; each
 * comes back as a suggestion to review on that day.
 */
export default function TripVibeSheet({
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
  const [vibe, setVibe] = useState<Vibe>(inputs.vibe);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  const affected = plan.days.filter((d) => vibeChanged(d.plannedVibe, effectiveVibe(vibe, d.vibe)));
  const dirty = JSON.stringify(vibe) !== JSON.stringify(inputs.vibe);

  async function replanAffected() {
    setTripVibe(trip.id, vibe);
    const next = { ...inputs, vibe };
    setProgress({ done: 0, total: affected.length, failed: 0 });
    let failed = 0;
    // One day at a time: easier on rate limits, and suggestions appear as they land.
    for (let i = 0; i < affected.length; i++) {
      const day = affected[i];
      const res = await replanDay({
        trip,
        inputs: next,
        day,
        dayItems: sortItems(plan.items.filter((it) => it.dayDate === day.date)),
        pendingForDay: plan.proposals.filter((p) => p.dayDate === day.date),
        reason: "You changed the trip's vibe.",
        email,
      });
      if (!res.ok) failed++;
      setProgress({ done: i + 1, total: affected.length, failed });
    }
  }

  return (
    <Sheet title="Trip vibe" onClose={onClose}>
      <p className="mb-4 text-sm text-muted">
        Sets the feel for every day. Any day can still have its own dials.
      </p>
      <VibeDials value={vibe} onChange={(k, v) => setVibe((p) => ({ ...p, [k]: v }))} idPrefix="trip" />

      {progress ? (
        <div className="mt-5 rounded-xl bg-surface-2 p-3 text-sm">
          {progress.done < progress.total
            ? `Re-planning day ${progress.done + 1} of ${progress.total}...`
            : `Done. Suggestions are waiting on ${progress.total - progress.failed} day${progress.total - progress.failed === 1 ? "" : "s"}.`}
          {progress.failed > 0 && <span className="block text-warn">{progress.failed} couldn&apos;t be re-planned. Try those days again.</span>}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={() => {
              setTripVibe(trip.id, vibe);
              onClose();
            }}
            disabled={!dirty}
            className="min-h-12 w-full rounded-xl border border-border font-medium disabled:opacity-50"
          >
            Save vibe
          </button>
          {affected.length > 0 && (
            <button
              type="button"
              onClick={replanAffected}
              disabled={!online}
              className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-60"
            >
              Save and re-plan {affected.length} day{affected.length === 1 ? "" : "s"}
            </button>
          )}
          {affected.length > 0 && !online && <p className="text-xs text-warn">Re-planning needs signal. Saving works offline.</p>}
        </div>
      )}
    </Sheet>
  );
}
