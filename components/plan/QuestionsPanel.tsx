"use client";

import { useEffect, useRef, useState } from "react";
import { useOnline } from "@/components/shell/useOnline";
import { askQuestion } from "@/components/notes/ask";
import { addNote, deleteNote } from "@/lib/data/notes";
import type { TripInputs } from "@/lib/model/inputs";
import { authorLabel, buildNote, MAX_NOTE_TEXT, unanswered, type Note } from "@/lib/model/note";
import type { Trip } from "@/lib/model/trip";
import type { PlanState } from "./usePlan";

const SHOWN = 3;

/**
 * Ask about this day, or the whole trip, right inside the plan. Answers use
 * the plan, your notes, the web, and each stop's weather. Questions are notes,
 * so they're also in the Ask tab, and asking with no signal waits for it.
 */
export default function QuestionsPanel({
  trip,
  inputs,
  plan,
  notes,
  email,
  dayDate,
}: {
  trip: Trip;
  inputs: TripInputs;
  plan: PlanState;
  notes: Note[];
  email: string;
  /** The day, or null for questions about the whole trip. */
  dayDate: string | null;
}) {
  const online = useOnline();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [all, setAll] = useState(false);
  const tried = useRef(new Set<string>());

  const questions = notes.filter((n) => n.kind === "question" && n.dayDate === dayDate);

  async function ask(n: Note) {
    tried.current.add(n.id);
    setBusy((b) => new Set(b).add(n.id));
    setErrors((e) => {
      const next = { ...e };
      delete next[n.id];
      return next;
    });
    const res = await askQuestion({ trip, inputs, plan, notes, note: n, email });
    setBusy((b) => {
      const next = new Set(b);
      next.delete(n.id);
      return next;
    });
    if (!res.ok) setErrors((e) => ({ ...e, [n.id]: res.error }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const built = buildNote({ kind: "question", text, dayDate }, email, Date.now());
    if (!built.ok) return;
    const id = addNote(trip.id, built.note);
    setText("");
    if (online) void ask({ ...built.note, id, pending: true });
  }

  // Asked here with no signal: answer once it's back (only on the phone that asked).
  useEffect(() => {
    if (!online || !plan.loaded) return;
    for (const n of unanswered(questions, email)) if (!tried.current.has(n.id)) void ask(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, plan.loaded, notes]);

  const shown = all ? questions : questions.slice(0, SHOWN);
  const label = dayDate ? "Ask about this day" : "Ask about the trip";

  return (
    <section aria-label={label} className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">{label}</h2>
      <form onSubmit={submit} className="mt-2 flex items-end gap-2">
        <textarea
          aria-label={dayDate ? "Question about this day" : "Question about the trip"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_NOTE_TEXT}
          rows={2}
          placeholder={dayDate ? "Will the trail be too hot by noon?" : "Does this line up well with the weather?"}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-base outline-none focus:border-accent"
        />
        <button type="submit" disabled={!text.trim()} className="min-h-12 shrink-0 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">
          Ask
        </button>
      </form>
      {!online && <p className="mt-1 text-xs text-muted">No signal: it&apos;s saved and gets answered when you&apos;re back online.</p>}

      {shown.length > 0 && (
        <ul className="mt-3 space-y-3">
          {shown.map((n) => (
            <li key={n.id} aria-label={`Question: ${n.text}`} className="border-t border-border pt-3">
              <p className="text-sm font-medium">{n.text}</p>
              <p className="text-[11px] text-muted">
                {authorLabel(n.createdBy, email)}
                {n.pending && <span className="ml-2 text-warn">waiting to sync</span>}
              </p>
              {n.answer ? (
                <div className="mt-2 rounded-xl bg-surface-2 p-3">
                  <p className="whitespace-pre-line text-sm leading-relaxed">{n.answer.text}</p>
                  {n.answer.sources.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {n.answer.sources.map((s) => (
                        <li key={s.url}>
                          <a href={s.url} target="_blank" rel="noreferrer" className="text-accent">
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] text-muted">AI answer. Double-check anything that matters.</p>
                </div>
              ) : busy.has(n.id) ? (
                <p className="mt-1 text-sm text-muted">Finding an answer...</p>
              ) : errors[n.id] ? (
                <p role="alert" className="mt-1 text-sm text-warn">
                  {errors[n.id]}{" "}
                  <button type="button" onClick={() => void ask(n)} disabled={!online} className="font-medium text-accent underline disabled:opacity-50">
                    Try again
                  </button>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">Waiting for signal.</p>
              )}
              <button type="button" onClick={() => deleteNote(trip.id, n.id)} className="mt-1 min-h-9 text-xs text-muted underline">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {questions.length > SHOWN && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 min-h-11 text-sm font-medium text-accent">
          {all ? "Show fewer" : `Show all ${questions.length} questions`}
        </button>
      )}
    </section>
  );
}
