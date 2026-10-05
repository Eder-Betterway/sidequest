"use client";

import { useEffect, useRef, useState } from "react";
import { useOnline } from "@/components/shell/useOnline";
import { usePlan } from "@/components/plan/usePlan";
import ProposalSheet from "@/components/plan/ProposalSheet";
import { replanDay } from "@/components/plan/replan";
import { Notice } from "@/components/ui/Notice";
import { Segmented } from "@/components/ui/fields";
import { callAi, todayIso } from "@/lib/ai/client";
import type { Usage } from "@/lib/ai/claude";
import { acceptProposal, dismissProposal } from "@/lib/data/plan";
import { addFlyerEventsToPlan, deleteNote, markNoteUsed, saveFlyerEvents } from "@/lib/data/notes";
import { readInputs } from "@/lib/model/inputs";
import { defaultNoteDay, replanNoteFor, unanswered, type FlyerEvent, type Note, type NoteKind } from "@/lib/model/note";
import { sortItems, type PlanItemDraft } from "@/lib/model/plan";
import type { Trip } from "@/lib/model/trip";
import { effectiveVibe } from "@/lib/plan/vibe";
import CaptureSheet, { dayChoices } from "./CaptureSheet";
import NoteCard, { type Work } from "./NoteCard";
import { useNotes } from "./useNotes";
import ListsCard from "@/components/lists/ListsCard";
import { askQuestion } from "./ask";
import { offerUndo } from "@/components/plan/undo";

/**
 * The Notes and Ask tabs. Capture works with no signal; when the phone that
 * asked (or snapped a flyer) is back online, questions get answered and flyers
 * get read without anyone tapping anything.
 */
type Filter = "all" | "notes" | "questions";

export default function NotesArea({ trip, email }: { trip: Trip; email: string }) {
  const plan = usePlan(trip.id);
  const { loaded, notes } = useNotes(trip.id);
  const inputs = readInputs(trip.inputs);
  const online = useOnline();
  const [capture, setCapture] = useState<NoteKind | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
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
    setBusy(n.id, "asking");
    setError(n.id, null);
    const res = await askQuestion({ trip, inputs, plan, notes, note: n, email });
    setBusy(n.id, null);
    if (!res.ok) setError(n.id, res.error);
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

  const shown = notes.filter((n) => filter === "all" || (filter === "questions" ? n.kind === "question" : n.kind !== "question"));
  const reviewing = reviewDay ? plan.proposals.filter((p) => p.dayDate === reviewDay).at(-1) : undefined;
  const reviewDayRecord = plan.days.find((d) => d.date === reviewDay);
  const startDay = defaultNoteDay(dates, todayIso());

  return (
    <div className="space-y-4">
      <ListsCard tripId={trip.id} modes={inputs.modes} email={email} />
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Capture it before you forget</h2>
        <p className="mt-1 text-sm text-muted">
          Works with no signal. Tips can become plan suggestions, flyers become plan items, and questions get answered with your trip in mind.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              ["tip", "Local tip"],
              ["note", "Note"],
              ["flyer", "Flyer photo"],
              ["question", "Question"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setCapture(k)} className="min-h-12 rounded-xl border border-border text-sm font-semibold">
              {label}
            </button>
          ))}
        </div>
      </section>

      {notes.length > 0 && <Segmented label="Show" options={["all", "notes", "questions"] as const} value={filter} onChange={setFilter} />}

      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          {filter === "questions" ? "No questions yet." : "Nothing yet. The best tips come from bartenders, rangers, and the person next to you at the hot spring."}
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
              onAddEvents={(picks: { dayDate: string; item: PlanItemDraft }[]) => offerUndo(trip.id, addFlyerEventsToPlan(trip.id, n.id, picks, plan.items, email), email)}
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
          initialDay={startDay}
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
            offerUndo(
              trip.id,
              acceptProposal(trip.id, reviewing, keep, dayItems(reviewDayRecord.date), reviewDayRecord, effectiveVibe(inputs.vibe, reviewDayRecord.vibe), email),
              email
            );
            setReviewDay(null);
          }}
        />
      )}
    </div>
  );
}

/** Shown on the Notes and Ask tabs when no trip is open. */
export function NoTripOpen() {
  return <Notice title="No trip open">Pick a trip from the name at the top, or start a new one. Notes and questions belong to a trip.</Notice>;
}
