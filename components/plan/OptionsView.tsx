"use client";

import { useState } from "react";
import { callAi, todayIso } from "@/lib/ai/client";
import { logAiRun, replacePlan, saveOptions, type ExpandedDay } from "@/lib/data/plan";
import { missingForOptions, type TripInputs } from "@/lib/model/inputs";
import type { StoredOption, TripOption } from "@/lib/model/plan";
import type { Trip } from "@/lib/model/trip";
import type { Usage } from "@/lib/ai/claude";
import { useOnline } from "@/components/shell/useOnline";
import type { PlanState } from "./usePlan";

const PACE_LABEL = { chill: "Chill", balanced: "Balanced", packed: "Packed" } as const;

/**
 * Draft three takes on the trip, compare them, pick one. Picking expands it
 * into a day-by-day plan (replacing any plan already there).
 */
export default function OptionsView({
  trip,
  inputs,
  plan,
  email,
  onEditInputs,
  onPlanned,
}: {
  trip: Trip;
  inputs: TripInputs;
  plan: PlanState;
  email: string;
  onEditInputs: () => void;
  onPlanned: () => void;
}) {
  const online = useOnline();
  const [busy, setBusy] = useState<"drafting" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const missing = missingForOptions(trip, inputs);
  const brief = { title: trip.title, startDate: trip.startDate!, endDate: trip.endDate! };

  async function draft() {
    setBusy("drafting");
    setError(null);
    const res = await callAi<{ options: TripOption[]; usage: Usage | null }>("/api/ai/options", {
      trip: brief,
      inputs,
      today: todayIso(),
    });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    saveOptions(trip.id, res.data.options, plan.options.map((o) => o.id), email);
    logAiRun(trip.id, "options", res.data.usage, email);
  }

  async function pick(option: StoredOption) {
    if (plan.days.length && !confirm("This replaces the current day plan, including your edits. Go ahead?")) return;
    setBusy(option.id);
    setError(null);
    const res = await callAi<{ days: ExpandedDay[]; usage: Usage | null }>("/api/ai/expand", {
      trip: brief,
      inputs,
      option: stripStored(option),
      today: todayIso(),
    });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    replacePlan(trip.id, option.id, res.data.days, { dayIds: plan.days.map((d) => d.id), itemIds: plan.items.map((i) => i.id) }, email);
    logAiRun(trip.id, "expand", res.data.usage, email);
    onPlanned();
  }

  if (missing.length) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Tell Sidequest about the trip</h2>
        <p className="mt-2 text-sm text-muted">Still needed: {missing.join(", ")}. Everything else is optional but makes the options better.</p>
        <button type="button" onClick={onEditInputs} className="mt-4 min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent">
          Plan this trip
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={draft}
        disabled={busy !== null || !online}
        className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-60"
      >
        {busy === "drafting" ? "Drafting 3 options..." : plan.options.length ? "Draft 3 new options" : "Draft 3 options"}
      </button>
      {!online && <p className="text-sm text-warn">Drafting options needs signal.</p>}
      {busy === "drafting" && (
        <p className="text-sm text-muted">This takes a minute or two. Weighing your milestones, route, and interests.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}

      {plan.options.map((o) => {
        const chosen = trip.chosenOptionId === o.id;
        return (
          <article key={o.id} className={`rounded-2xl border bg-surface p-5 shadow-sm ${chosen ? "border-accent" : "border-border"}`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold">{o.title}</h3>
              <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium">{PACE_LABEL[o.pace]}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed">{o.pitch}</p>
            <p className="mt-2 text-xs text-muted">{o.differsBy}</p>

            <ol className="mt-4 space-y-1.5 border-l-2 border-accent/40 pl-4">
              {o.route.map((s, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{s.place}</span>
                  <span className="text-muted"> · {s.nights === 0 ? "pass through" : `${s.nights} night${s.nights === 1 ? "" : "s"}`}</span>
                </li>
              ))}
            </ol>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Highlights</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
              {o.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Tradeoffs</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
              {o.tradeoffs.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              About {Math.round(o.estDriveHours)} hours of travel · {o.milestoneFit}
            </p>

            <button
              type="button"
              onClick={() => pick(o)}
              disabled={busy !== null || !online}
              className="mt-4 min-h-12 w-full rounded-xl border-2 border-accent font-semibold text-accent disabled:opacity-50"
            >
              {busy === o.id ? "Building your days..." : chosen ? "Rebuild days from this one" : "Pick this one"}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function stripStored(o: StoredOption & { pending?: boolean }): TripOption {
  const { title, pitch, differsBy, route, highlights, tradeoffs, milestoneFit, estDriveHours, pace } = o;
  return { title, pitch, differsBy, route, highlights, tradeoffs, milestoneFit, estDriveHours, pace };
}
