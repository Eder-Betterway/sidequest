"use client";

import { callAi, todayIso } from "@/lib/ai/client";
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
  email: string;
}): Promise<{ ok: true; changedDays: number; summary: string } | { ok: false; error: string }> {
  const { trip, inputs, plan, instruction, focusDate, email } = args;
  if (!trip.startDate || !trip.endDate) return { ok: false, error: "The trip needs dates first." };

  const res = await callAi<{ summary: string; days: ChangedDay[]; usage: Usage | null }>("/api/ai/reroute", {
    trip: { title: trip.title, startDate: trip.startDate, endDate: trip.endDate },
    inputs,
    days: plan.days.slice(0, 60).map((d) => ({
      date: d.date,
      base: d.base.slice(0, 200),
      title: d.title.slice(0, 200),
      lat: d.place?.lat ?? null,
      lng: d.place?.lng ?? null,
      items: sortItems(plan.items.filter((i) => i.dayDate === d.date))
        .slice(0, 40)
        .map((i) => ({ kind: i.kind, title: i.title, start: i.start, end: i.end, place: i.place, notes: i.notes, locked: i.locked })),
    })),
    instruction,
    focusDate,
    today: todayIso(),
  });
  if (!res.ok) return res;
  logAiRun(trip.id, "reroute", res.data.usage, email);

  const { changes, basedOn } = buildTripChanges(plan.days, plan.items, res.data.days);
  if (changes.length > 0) {
    saveTripProposal(
      trip.id,
      { instruction, focusDate, summary: res.data.summary, days: changes, basedOn, createdBy: email, createdAt: Date.now() },
      plan.tripProposals.map((p) => p.id)
    );
  }
  return { ok: true, changedDays: changes.length, summary: res.data.summary };
}
