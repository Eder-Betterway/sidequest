"use client";

import { callAiStream, todayIso } from "@/lib/ai/client";
import type { JobEvent } from "@/lib/ai/progress";
import type { Usage } from "@/lib/ai/claude";
import { logAiRun, saveTripProposal } from "@/lib/data/plan";
import type { TripInputs } from "@/lib/model/inputs";
import { sortItems } from "@/lib/model/plan";
import type { Trip } from "@/lib/model/trip";
import { buildTripChanges, type ChangedDay } from "@/lib/plan/tripProposal";
import type { PlanState } from "./usePlan";

/**
 * Ask Claude to change the trip ("stay in Palm Springs through the 14th") and
 * save the answer as a trip-wide suggestion both phones can see. Nothing in
 * the plan changes until someone applies it.
 */
export async function rerouteTrip(args: {
  trip: Trip;
  inputs: TripInputs;
  plan: PlanState;
  instruction: string;
  focusDate: string | null;
  /** Draft changes included in this request, cleared once the result is applied. */
  draftIds?: string[];
  email: string;
  /** Hears each stage while Claude works. */
  onProgress?: (e: Extract<JobEvent, { type: "progress" }>) => void;
  /** How many requests are bundled, for "working on 4 changes". */
  requests?: number;
}): Promise<{ ok: true; changedDays: number; summary: string } | { ok: false; error: string; stillWorking?: boolean }> {
  const { trip, inputs, plan, instruction, focusDate, email } = args;
  if (!trip.startDate || !trip.endDate) return { ok: false, error: "The trip needs dates first." };

  let tracked = false;
  const res = await callAiStream<{ summary: string; days: ChangedDay[]; usage: Usage | null; saved: { proposalId: string | null; changedDays: number } | null }>(
    "/api/ai/reroute",
    {
      trip: { title: trip.title, startDate: trip.startDate, endDate: trip.endDate },
      inputs,
      days: plan.days.slice(0, 60).map((d) => ({
        date: d.date,
        base: d.base.slice(0, 200),
        title: d.title.slice(0, 200),
        updatedAt: d.updatedAt,
        lat: d.place?.lat ?? null,
        lng: d.place?.lng ?? null,
        items: sortItems(plan.items.filter((i) => i.dayDate === d.date))
          .slice(0, 40)
          .map((i) => ({ id: i.id, updatedAt: i.updatedAt, kind: i.kind, title: i.title, start: i.start, end: i.end, place: i.place, notes: i.notes, locked: i.locked })),
      })),
      instruction,
      focusDate,
      today: todayIso(),
      // Let the server save the suggestion, so it lands even if this phone locks.
      save: { tripId: trip.id, previous: plan.tripProposals.map((p) => p.id), draftIds: args.draftIds ?? [], requests: args.requests ?? 1 },
    },
    args.onProgress ?? (() => {}),
    () => {
      tracked = true;
    }
  );
  if (!res.ok) {
    // The server is still on it and will save the suggestion when it's done.
    if ("dropped" in res && tracked) return { ok: false, error: res.error, stillWorking: true };
    return { ok: false, error: res.error };
  }
  if (res.data.saved) return { ok: true, changedDays: res.data.saved.changedDays, summary: res.data.summary };

  // The server couldn't save it: do it from here, like before.
  logAiRun(trip.id, "reroute", res.data.usage, email);
  const { changes, basedOn } = buildTripChanges(plan.days, plan.items, res.data.days);
  if (changes.length > 0) {
    saveTripProposal(
      trip.id,
      {
        instruction,
        focusDate,
        summary: res.data.summary,
        days: changes,
        basedOn,
        draftIds: args.draftIds ?? [],
        createdBy: email,
        createdAt: Date.now(),
      },
      plan.tripProposals.map((p) => p.id)
    );
  }
  return { ok: true, changedDays: changes.length, summary: res.data.summary };
}
