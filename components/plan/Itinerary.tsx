"use client";

import { useMemo } from "react";
import { setRules } from "@/lib/data/plan";
import type { TripInputs } from "@/lib/model/inputs";
import { formatTime, sortItems, type StoredItem } from "@/lib/model/plan";
import type { Trip } from "@/lib/model/trip";
import { estimateLeg, formatHours } from "@/lib/model/van";
import { formatTripDates } from "@/lib/model/trip";
import { previewItems } from "@/lib/plan/brief";
import type { PlanState } from "./usePlan";
import type { ChangeDraft } from "@/lib/model/draft";
import type { Note } from "@/lib/model/note";
import QuestionsPanel from "./QuestionsPanel";


function dayLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    day: d.getUTCDate(),
    long: d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

/**
 * The whole trip on one screen: stops in order, every day under its stop
 * with what's planned. Tap a day to open it; ask for a change on any day or
 * the whole trip.
 */
export default function Itinerary({
  trip,
  inputs,
  plan,
  notes,
  drafts,
  email,
  onOpenDay,
  onChange,
}: {
  trip: Trip;
  inputs: TripInputs;
  plan: PlanState;
  notes: Note[];
  drafts: ChangeDraft[];
  email: string;
  onOpenDay: (date: string) => void;
  onChange: (focusDate: string | null) => void;
}) {
  const units = inputs.units;
  const drives = inputs.modes.includes("campervan") || inputs.modes.includes("car");

  const stays = useMemo(() => {
    const byDay = new Map<string, StoredItem[]>();
    for (const i of plan.items) byDay.set(i.dayDate, [...(byDay.get(i.dayDate) ?? []), i]);
    const groups: { base: string; days: { date: string; title: string; items: StoredItem[]; index: number }[]; place: PlanState["days"][number]["place"] }[] = [];
    plan.days.forEach((d, index) => {
      const entry = { date: d.date, title: d.title, items: sortItems(byDay.get(d.date) ?? []), index };
      const last = groups[groups.length - 1];
      if (last && last.base === d.base) last.days.push(entry);
      else groups.push({ base: d.base, days: [entry], place: d.place });
    });
    return groups;
  }, [plan.days, plan.items]);

  const pendingDays = new Set(plan.proposals.map((p) => p.dayDate));
  const draftCount = (date: string) => drafts.filter((d) => d.dayDate === date).length;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Your itinerary</h2>
        <p className="text-sm text-muted">
          {plan.days.length} days · {stays.length} {stays.length === 1 ? "stop" : "stops"}
        </p>
        <button type="button" onClick={() => onChange(null)} className="mt-3 min-h-12 w-full rounded-xl bg-accent text-sm font-semibold text-on-accent">
          {drafts.length ? `Review ${drafts.length} draft change${drafts.length === 1 ? "" : "s"}` : "Change the trip"}
        </button>
        {drafts.length > 0 && (
          <p className="mt-1 text-center text-xs text-muted">Drafts go to Claude together when you suggest changes.</p>
        )}
        {inputs.rules.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Rules every re-plan follows</p>
            <ul className="mt-1 space-y-1">
              {inputs.rules.map((r) => (
                <li key={r} className="flex items-start justify-between gap-2 text-sm">
                  <span className="py-2">{r}</span>
                  <button
                    type="button"
                    aria-label={`Remove rule: ${r}`}
                    onClick={() => setRules(trip.id, inputs.rules.filter((x) => x !== r))}
                    className="min-h-11 shrink-0 px-2 text-xs text-muted underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <QuestionsPanel trip={trip} inputs={inputs} plan={plan} notes={notes} email={email} dayDate={null} />

      {stays.map((stay, s) => {
        const prev = stays[s - 1];
        const leg = drives && prev?.place && stay.place ? estimateLeg(prev.place, stay.place) : null;
        const first = stay.days[0].date;
        const last = stay.days[stay.days.length - 1].date;
        return (
          <section key={`${stay.base}-${first}`} aria-label={stay.base}>
            {leg && <p className="mb-2 pl-1 text-xs text-muted">About {formatHours(leg.hours)} of driving</p>}
            <div className="rounded-2xl border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <h3 className="font-semibold">{stay.base}</h3>
                <p className="text-xs text-muted">
                  {formatTripDates(first, last)} · {stay.days.length} {stay.days.length === 1 ? "day" : "days"}
                </p>
              </div>
              <ol>
                {stay.days.map((d) => {
                  const l = dayLabel(d.date);
                  return (
                    <li key={d.date} className="flex items-stretch border-b border-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => onOpenDay(d.date)}
                        aria-label={`Day ${d.index + 1}, ${l.long}`}
                        className="flex min-w-0 flex-1 gap-3 px-4 py-3 text-left"
                      >
                        <span className="w-10 shrink-0 text-center">
                          <span className="block text-[11px] font-medium text-muted">{l.weekday}</span>
                          <span className="block text-lg font-bold leading-tight">{l.day}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{d.title}</span>
                          {previewItems(d.items).map((i) => (
                            <span key={i.id} className={`block truncate text-xs ${i.kind === "milestone" ? "font-semibold text-accent" : "text-muted"}`}>
                              {i.kind === "milestone" ? "★ " : ""}
                              {i.start ? `${formatTime(i.start, units)} ` : ""}
                              {i.title}
                            </span>
                          ))}
                          {d.items.length > previewItems(d.items).length && (
                            <span className="block text-xs text-muted">+{d.items.length - previewItems(d.items).length} more</span>
                          )}
                          {draftCount(d.date) > 0 && (
                            <span className="mr-1 mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold">
                              {draftCount(d.date)} draft{draftCount(d.date) === 1 ? "" : "s"}
                            </span>
                          )}
                          {pendingDays.has(d.date) && (
                            <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                              Suggestion waiting
                            </span>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange(d.date)}
                        aria-label={`Change ${l.long}`}
                        className="min-w-16 shrink-0 px-3 text-xs font-medium text-accent"
                      >
                        Change
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        );
      })}
    </div>
  );
}
