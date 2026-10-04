"use client";

import { callAi, todayIso } from "@/lib/ai/client";
import type { Usage } from "@/lib/ai/claude";
import { saveAnswer } from "@/lib/data/notes";
import type { TripInputs } from "@/lib/model/inputs";
import type { Note } from "@/lib/model/note";
import type { Source } from "@/lib/model/place";
import { sortItems } from "@/lib/model/plan";
import type { Trip } from "@/lib/model/trip";
import type { PlanState } from "@/components/plan/usePlan";

/**
 * Get an answer to a question note, with the plan, recent notes, and each
 * stop's location (for weather) as context, and save it on the note so both
 * phones see it offline. Shared by the Ask tab and the Plan's question boxes.
 */
export async function askQuestion(args: {
  trip: Trip;
  inputs: TripInputs;
  plan: Pick<PlanState, "days" | "items">;
  notes: Note[];
  note: Note;
  email: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { trip, inputs, plan, notes, note, email } = args;
  if (!trip.startDate || !trip.endDate) return { ok: false, error: "Add the trip's dates first." };
  const res = await callAi<{ text: string; sources: Source[]; usage: Usage | null }>("/api/ai/ask", {
    trip: { title: trip.title, startDate: trip.startDate, endDate: trip.endDate },
    inputs,
    question: note.text,
    dayDate: note.dayDate,
    days: plan.days.slice(0, 60).map((d) => ({
      date: d.date,
      base: d.base.slice(0, 200),
      title: d.title.slice(0, 200),
      lat: d.place?.lat ?? null,
      lng: d.place?.lng ?? null,
      items: sortItems(plan.items.filter((i) => i.dayDate === d.date))
        .slice(0, 40)
        .map((i) => ({ start: i.start, title: i.title.slice(0, 200), place: i.place?.slice(0, 200) ?? null, locked: i.locked })),
    })),
    notes: notes.filter((x) => x.kind !== "question" && x.text).slice(0, 30).map((x) => x.text),
    today: todayIso(),
  });
  if (!res.ok) return res;
  saveAnswer(trip.id, note.id, { text: res.data.text, sources: res.data.sources }, res.data.usage, email);
  return { ok: true };
}
