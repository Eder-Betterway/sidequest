"use client";

import { useEffect, useRef, useState } from "react";
import { useOnline } from "@/components/shell/useOnline";
import { usePlan } from "@/components/plan/usePlan";
import ProposalSheet from "@/components/plan/ProposalSheet";
import { replanDay } from "@/components/plan/replan";
import { Notice } from "@/components/trip/TripsView";
import { callAi, todayIso } from "@/lib/ai/client";
import type { Usage } from "@/lib/ai/claude";
import { acceptProposal, dismissProposal } from "@/lib/data/plan";
import { addFlyerEventsToPlan, deleteNote, markNoteUsed, saveAnswer, saveFlyerEvents } from "@/lib/data/notes";
import { readInputs } from "@/lib/model/inputs";
import { defaultNoteDay, replanNoteFor, unanswered, type FlyerEvent, type Note, type NoteKind } from "@/lib/model/note";
import type { Source } from "@/lib/model/place";
import { sortItems, type PlanItemDraft } from "@/lib/model/plan";
import type { Trip } from "@/lib/model/trip";
import { effectiveVibe } from "@/lib/plan/vibe";
import CaptureSheet, { dayChoices } from "./CaptureSheet";
import NoteCard, { type Work } from "./NoteCard";
import { useNotes } from "./useNotes";

/**
 * The Notes and Ask tabs. Capture works with no signal; when the phone that
 * asked (or snapped a flyer) is back online, questions get answered and flyers
 * get read without anyone tapping anything.
 */
export default function NotesArea({
  trip,
  email,
  tab,
  startAsking = false,
}: {
  trip: Trip;
  email: string;
  tab: "notes" | "ask";
  /** Open with the question box up, about the whole trip. */
  startAsking?: boolean;
}) {
  const plan = usePlan(trip.id);
  const { loaded, notes } = useNotes(trip.id);
  const inputs = readInputs(trip.inputs);
  const online = useOnline();
  const [capture, setCapture] = useState<NoteKind | null>(startAsking ? "question" : null);
  const [work, setWork] = useState<Record<string, Work>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reviewDay, setReviewDay] = useState<string | null>(null);
  const tried = useRef(new Set<string>());

  const days = dayChoices(plan.days);
  const dates = plan.days.map((d) => d.date);
  const brief = trip.startDate && trip.endDate ? { title: trip.title, startDate: trip.startDate, endDate: trip.endDate } : null;
  const dayItems = (date: string) => sortItems(plan.items.filter((i) => i.dayDate === date));

  const setBusy = (id: string, w: Work | null) =>
    setWork((prev) => {
      const next = { ...prev };
      if (w) next[id] = w;
      else delete next[id];
      return next;
    });
  const setError = (key: string, msg: string | null) =>
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next[key] = msg;
      else delete next[key];
      return next;
    });

  async function ask(n: Note) {
    if (!brief) return setError(n.id, "Add the trip's dates first.");
    setBusy(n.id, "asking");
    setError(n.id, null);
    const res = await callAi<{ text: string; sources: Source[]; usage: Usage | null }>("/api/ai/ask", {
      trip: brief,
      inputs,
      question: n.text,
      dayDate: n.dayDate,
      days: plan.days.slice(0, 60).map((d) => ({
        date: d.date,
        base: d.base.slice(0, 200),
        title: d.title.slice(0, 200),
        lat: d.place?.lat ?? null,
        lng: d.place?.lng ?? null,
        items: dayItems(d.date)
          .slice(0, 40)
          .map((i) => ({ start: i.start, title: i.title.slice(0, 200), place: i.place?.slice(0, 200) ?? null, locked: i.locked })),
      })),
      notes: notes.filter((x) => x.kind !== "question" && x.text).slice(0, 30).map((x) => x.text),
      today: todayIso(),
    });
    setBusy(n.id, null);
    if (!res.ok) return setError(n.id, res.error);
    saveAnswer(trip.id, n.id, { text: res.data.text, sources: res.data.sources }, res.data.usage, email);
  }

  async function read(n: Note) {
    if (!brief || !n.photo) return setError(n.id, "Add the trip's dates first.");
    setBusy(n.id, "reading");
    setError(n.id, null);
    const near = plan.days.find((d) => d.date === (n.dayDate ?? todayIso()))?.base ?? null;
    const res = await callAi<{ events: FlyerEvent[]; usage: Usage | null }>("/api/ai/flyer", {
      trip: brief,
      image: n.photo.data,
      mediaType: n.photo.mediaType,
      near,
      today: todayIso(),
    });
    setBusy(n.id, null);
    if (!res.ok) return setError(n.id, res.error);
    saveFlyerEvents(trip.id, n.id, res.data.events, res.data.usage, email);
  }

  async function workIn(n: Note, dayDate: string) {
    const day = plan.days.find((d) => d.date === dayDate);
    if (!day) return setError(`${n.id}:plan`, "Pick a day on the plan.");
    setBusy(n.id, "planning");
    setError(`${n.id}:plan`, null);
    const quote = n.text.length > 80 ? `${n.text.slice(0, 80)}...` : n.text;
    const res = await replanDay({
      trip,
      inputs,
      day,
      dayItems: dayItems(dayDate),
      pendingForDay: plan.proposals.filter((p) => p.dayDate === dayDate),
      reason: `From a ${n.kind}: "${quote}"`,
      note: replanNoteFor(n),
      email,
    });
    setBusy(n.id, null);
    if (!res.ok) return setError(`${n.id}:plan`, res.error);
    markNoteUsed(trip.id, n.id, dayDate);
    setReviewDay(dayDate);
  }

  // Questions asked and flyers snapped with no signal: pick them up once online.
  // Only on the phone that made them, and once per visit, so nothing pays twice.
  useEffect(() => {
    if (!online || !loaded || !plan.loaded) return;
    const todo = [
      ...unanswered(notes, email).map((n) => ({ n, run: ask })),
      ...notes.filter((n) => n.kind === "flyer" && n.photo && !n.events && n.createdBy === email.toLowerCase()).map((n) => ({ n, run: read })),
    ].filter(({ n }) => !tried.current.has(n.id));
    for (const { n, run } of todo) {
      tried.current.add(n.id);
      void run(n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, loaded, plan.loaded, notes]);

  if (!loaded) return <p className="py-6 text-center text-sm text-muted">Loading...</p>;

  const shown = notes.filter((n) => (tab === "ask" ? n.kind === "question" : n.kind !== "question"));
  const reviewing = reviewDay ? plan.proposals.filter((p) => p.dayDate === reviewDay).at(-1) : undefined;
  const reviewDayRecord = plan.days.find((d) => d.date === reviewDay);
  const startDay = defaultNoteDay(dates, todayIso());

  return (
    <div className="space-y-4">
      {tab === "notes" ? (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Capture it before you forget</h2>
          <p className="mt-1 text-sm text-muted">Works with no signal. Tips can become plan suggestions, and flyers become plan items.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["tip", "Local tip"],
                ["note", "Note"],
                ["flyer", "Flyer photo"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setCapture(k)} className="min-h-12 rounded-xl border border-border text-sm font-semibold">
                {label}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Ask anything about the trip</h2>
          <p className="mt-1 text-sm text-muted">Answered with your plan, notes, and the web in mind. Ask with no signal and it&apos;s answered when you&apos;re back online.</p>
          <button type="button" onClick={() => setCapture("question")} className="mt-3 min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent">
            Ask a question
          </button>
        </section>
      )}

      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          {tab === "ask" ? "No questions yet." : "Nothing yet. The best tips come from bartenders, rangers, and the person next to you at the hot spring."}
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              me={email}
              days={days}
              units={inputs.units}
              online={online}
              work={work[n.id] ?? null}
              error={errors[n.id] ?? null}
              planError={errors[`${n.id}:plan`] ?? null}
              onAsk={() => void ask(n)}
              onRead={() => void read(n)}
              onPlan={(d) => void workIn(n, d)}
              onAddEvents={(picks: { dayDate: string; item: PlanItemDraft }[]) => addFlyerEventsToPlan(trip.id, n.id, picks, plan.items, email)}
              onDelete={() => deleteNote(trip.id, n.id)}
            />
          ))}
        </div>
      )}

      {capture && (
        <CaptureSheet
          tripId={trip.id}
          email={email}
          kinds={capture === "question" ? ["question"] : ["tip", "note", "flyer"]}
          initialKind={capture}
          days={days}
          initialDay={startAsking && capture === "question" ? null : startDay}
          onClose={() => setCapture(null)}
        />
      )}

      {reviewing && reviewDayRecord && (
        <ProposalSheet
          proposal={reviewing}
          dayItems={dayItems(reviewDayRecord.date)}
          units={inputs.units}
          onClose={() => setReviewDay(null)}
          onDismiss={() => {
            dismissProposal(trip.id, reviewing.id);
            setReviewDay(null);
          }}
          onApply={(keep) => {
            acceptProposal(trip.id, reviewing, keep, dayItems(reviewDayRecord.date), effectiveVibe(inputs.vibe, reviewDayRecord.vibe), email);
            setReviewDay(null);
          }}
        />
      )}
    </div>
  );
}

/** Shown on the Notes and Ask tabs when no trip is open. */
export function NoTripOpen() {
  return <Notice title="No trip open">Pick a trip on the Trips tab first. Notes and questions belong to a trip.</Notice>;
}
