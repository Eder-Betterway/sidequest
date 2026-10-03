"use client";

import { useEffect, useRef, useState } from "react";
import { acceptProposal, dismissProposal, setDayVibe } from "@/lib/data/plan";
import type { TripInputs } from "@/lib/model/inputs";
import type { StoredDay, StoredItem } from "@/lib/model/plan";
import type { Trip } from "@/lib/model/trip";
import type { Proposal } from "@/lib/plan/proposal";
import { DIALS, effectiveVibe, vibeChanged, type DialKey, type VibeOverride } from "@/lib/plan/vibe";
import { useOnline } from "@/components/shell/useOnline";
import VibeDials from "./VibeDials";
import ProposalSheet from "./ProposalSheet";
import { replanDay } from "./replan";

/**
 * Under each day's header: tune this day's vibe, re-plan it, and review the
 * suggestion that comes back.
 */
export default function DayTuner({
  trip,
  inputs,
  day,
  dayItems,
  proposals,
  email,
}: {
  trip: Trip;
  inputs: TripInputs;
  day: StoredDay;
  dayItems: StoredItem[];
  proposals: Proposal[];
  email: string;
}) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  // Local copy so sliders move smoothly; saved shortly after you stop dragging.
  const [override, setOverride] = useState<VibeOverride>(day.vibe ?? {});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const vibe = effectiveVibe(inputs.vibe, override);
  const changed = vibeChanged(day.plannedVibe, vibe);
  const pending = proposals.filter((p) => p.dayDate === day.date);
  const latest = pending[pending.length - 1];
  const inherited = new Set<DialKey>(DIALS.map((d) => d.key).filter((k) => override[k] === undefined));

  function move(key: DialKey, v: number) {
    const next = { ...override, [key]: v };
    setOverride(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setDayVibe(trip.id, day.date, next), 400);
  }

  function reset() {
    setOverride({});
    setDayVibe(trip.id, day.date, null);
  }

  async function replan() {
    setBusy(true);
    setError(null);
    const res = await replanDay({
      trip,
      inputs: { ...inputs },
      day: { ...day, vibe: override },
      dayItems,
      pendingForDay: pending,
      reason: changed ? "You changed this day's vibe." : "You asked for a fresh take on this day.",
      email,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setReviewing(true);
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {latest && (
        <button
          type="button"
          onClick={() => setReviewing(true)}
          className="flex min-h-12 w-full items-center justify-between rounded-xl bg-accent-soft px-3 text-left text-sm font-semibold text-accent"
        >
          Suggested changes ready
          <span aria-hidden>›</span>
        </button>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="min-h-11 flex-1 rounded-xl border border-border text-sm font-medium"
        >
          {open ? "Hide day vibe" : "Day vibe"}
          {changed && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] text-on-accent">changed</span>}
        </button>
        <button
          type="button"
          onClick={replan}
          disabled={busy || !online}
          className="min-h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          {busy ? "Re-planning..." : "Re-plan this day"}
        </button>
      </div>
      {!online && <p className="text-xs text-warn">Re-planning needs signal. Dial changes still save.</p>}
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}

      {open && (
        <div className="rounded-xl bg-surface-2 p-3">
          <VibeDials value={vibe} onChange={move} inherited={inherited} idPrefix={`day-${day.date}`} />
          {inherited.size < DIALS.length && (
            <button type="button" onClick={reset} className="mt-3 min-h-11 text-sm text-muted underline">
              Use the trip&apos;s vibe for this day
            </button>
          )}
        </div>
      )}

      {reviewing && latest && (
        <ProposalSheet
          proposal={latest}
          dayItems={dayItems}
          units={inputs.units}
          onClose={() => setReviewing(false)}
          onDismiss={() => {
            dismissProposal(trip.id, latest.id);
            setReviewing(false);
          }}
          onApply={(keep) => {
            acceptProposal(trip.id, latest, keep, dayItems, vibe, email);
            setReviewing(false);
          }}
        />
      )}
    </div>
  );
}
