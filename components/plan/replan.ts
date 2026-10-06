"use client";

import { callAiStream, todayIso } from "@/lib/ai/client";
import type { JobEvent } from "@/lib/ai/progress";
import { logAiRun, saveProposal } from "@/lib/data/plan";
import type { TripInputs } from "@/lib/model/inputs";
import type { PlanItemDraft, StoredDay, StoredItem } from "@/lib/model/plan";
import type { Trip } from "@/lib/model/trip";
import type { Usage } from "@/lib/ai/claude";
import { diffDay, type Proposal } from "@/lib/plan/proposal";
import { effectiveVibe, type Vibe } from "@/lib/plan/vibe";

/**
 * Ask Claude for a new take on one day and save it as a proposal both phones
 * can see. Nothing in the plan changes until someone applies it.
 */
export async function replanDay(args: {
  trip: Trip;
  inputs: TripInputs;
  day: StoredDay;
  dayItems: StoredItem[];
  pendingForDay: Proposal[];
  reason: string;
  note?: string | null;
  email: string;
  /** Hears each stage while Claude works. */
  onProgress?: (e: Extract<JobEvent, { type: "progress" }>) => void;
}): Promise<{ ok: true; changes: number } | { ok: false; error: string }> {
  const { trip, inputs, day, dayItems, email } = args;
  if (!trip.startDate || !trip.endDate) return { ok: false, error: "The trip needs dates first." };
  const vibe: Vibe = effectiveVibe(inputs.vibe, day.vibe);

  const res = await callAiStream<{ summary: string; items: PlanItemDraft[]; usage: Usage | null }>("/api/ai/replan", {
    trip: { title: trip.title, startDate: trip.startDate, endDate: trip.endDate },
    inputs,
    day: { date: day.date, base: day.base, title: day.title },
    items: dayItems.map((i) => ({
      kind: i.kind,
      title: i.title,
      start: i.start,
      end: i.end,
      place: i.place,
      notes: i.notes,
      locked: i.locked,
    })),
    vibe,
    note: args.note ?? null,
    today: todayIso(),
  }, args.onProgress ?? (() => {}));
  if (!res.ok) return res;

  const ops = diffDay(dayItems, res.data.items);
  saveProposal(
    trip.id,
    {
      dayDate: day.date,
      reason: args.reason,
      summary: res.data.summary,
      ops,
      basedOn: Object.fromEntries(dayItems.map((i) => [i.id, i.updatedAt])),
      createdBy: email,
      createdAt: Date.now(),
    },
    args.pendingForDay.map((p) => p.id)
  );
  logAiRun(trip.id, "replan", res.data.usage, email);
  return { ok: true, changes: ops.length };
}
