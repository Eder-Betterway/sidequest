"use client";

import { useState } from "react";
import { authorLabel, eventDay, type FlyerEvent, type Note } from "@/lib/model/note";
import { formatTime, toMinutes, type PlanItemDraft } from "@/lib/model/plan";
import type { DayChoice } from "./CaptureSheet";
import SpeakButton from "@/components/voice/SpeakButton";

const KIND_LABEL: Record<Note["kind"], string> = { note: "Note", tip: "Tip", question: "Question", flyer: "Flyer" };

export type Work = "asking" | "reading" | "planning";

/** One note, tip, question, or flyer, with what you can do with it. */
export default function NoteCard({
  note,
  me,
  days,
  units,
  online,
  work,
  error,
  planError,
  onAsk,
  onRead,
  onPlan,
  onAddEvents,
  onDelete,
}: {
  note: Note;
  me: string;
  days: DayChoice[];
  units: "imperial" | "metric";
  online: boolean;
  work: Work | null;
  /** Asking or reading went wrong. */
  error: string | null;
  /** Working it into the plan went wrong. */
  planError: string | null;
  onAsk: () => void;
  onRead: () => void;
  onPlan: (dayDate: string) => void;
  onAddEvents: (picks: { dayDate: string; item: PlanItemDraft }[]) => void;
  onDelete: () => void;
}) {
  const [planDay, setPlanDay] = useState<string>(note.dayDate ?? days[0]?.date ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const day = days.find((d) => d.date === note.dayDate);
  const mine = note.createdBy === me.trim().toLowerCase();
  const canPlan = days.length > 0 && note.text && (note.kind === "note" || note.kind === "tip" || (note.kind === "question" && note.answer));
  const when = new Date(note.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <article aria-label={`${KIND_LABEL[note.kind]}: ${note.text || "flyer photo"}`} className="rounded-2xl border border-border bg-surface p-4">
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">{KIND_LABEL[note.kind]}</span>
        <span>
          {authorLabel(note.createdBy, me)} · {when}
        </span>
        {day && <span>· {day.label}</span>}
        {note.pending && <span className="text-warn">waiting to sync</span>}
      </p>
      {note.text && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{note.text}</p>}

      {note.kind === "question" &&
        (note.answer ? (
          <div className="mt-3 rounded-xl bg-surface-2 p-3">
            <p className="whitespace-pre-line text-sm leading-relaxed">{note.answer.text}</p>
            {note.answer.sources.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {note.answer.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-accent">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted">AI answer. Double-check anything that matters.</p>
            <SpeakButton text={note.answer.text} />
          </div>
        ) : (
          <Status
            busy={work === "asking"}
            busyText="Finding an answer..."
            mine={mine}
            waitingText={mine ? "Waiting for signal. It gets answered when you're back online with the app open." : "Waiting for the phone that asked to get the answer."}
            online={online}
            error={error}
            retryLabel="Get the answer"
            onRetry={onAsk}
          />
        ))}

      {note.kind === "flyer" && note.photo && !note.events && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:${note.photo.mediaType};base64,${note.photo.data}`} alt="Flyer photo" className="mt-3 max-h-48 rounded-xl" />
          <Status
            busy={work === "reading"}
            busyText="Reading the flyer..."
            mine={mine}
            waitingText={mine ? "Waiting for signal to read it." : "Waiting for the phone that snapped it to read it."}
            online={online}
            error={error}
            retryLabel="Read the flyer"
            onRetry={onRead}
          />
        </>
      )}

      {note.kind === "flyer" && note.events && (
        <FlyerEvents events={note.events} days={days} units={units} used={Boolean(note.usedAt)} fallbackDay={note.dayDate} onAdd={onAddEvents} />
      )}

      {canPlan && (
        <div className="mt-3 border-t border-border pt-3">
          {note.usedAt && <p className="mb-2 text-xs text-ok">Turned into a plan suggestion.</p>}
          <div className="flex items-center gap-2">
            {!note.dayDate && (
              <select
                aria-label="Day to change"
                value={planDay}
                onChange={(e) => setPlanDay(e.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg px-2 text-sm"
              >
                {days.map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => onPlan(note.dayDate ?? planDay)}
              disabled={!online || work === "planning"}
              className="min-h-11 flex-1 rounded-xl border border-accent px-3 text-sm font-semibold text-accent disabled:opacity-50"
            >
              {work === "planning" ? "Working it in..." : note.usedAt ? "Suggest again" : "Work into the plan"}
            </button>
          </div>
          {!online && <p className="mt-1 text-xs text-warn">Needs signal. The note is saved.</p>}
          {planError && work === null && (
            <p role="alert" className="mt-1 text-sm text-warn">
              {planError}
            </p>
          )}
        </div>
      )}

      <div className="mt-2 text-right">
        {confirmDelete ? (
          <span className="text-sm">
            <button type="button" onClick={onDelete} className="min-h-11 px-2 font-semibold text-warn">
              Delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 px-2 text-muted">
              Keep
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 px-2 text-xs text-muted underline">
            Delete
          </button>
        )}
      </div>
    </article>
  );
}

function Status({
  busy,
  busyText,
  mine,
  waitingText,
  online,
  error,
  retryLabel,
  onRetry,
}: {
  busy: boolean;
  busyText: string;
  mine: boolean;
  waitingText: string;
  online: boolean;
  error: string | null;
  retryLabel: string;
  onRetry: () => void;
}) {
  if (busy) return <p className="mt-3 text-sm text-muted">{busyText}</p>;
  if (error)
    return (
      <div className="mt-3">
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
        <button type="button" onClick={onRetry} disabled={!online} className="mt-1 min-h-11 text-sm font-medium text-accent disabled:opacity-50">
          {retryLabel}
        </button>
      </div>
    );
  // The asking phone picks it up on its own as soon as it's online.
  return <p className="mt-3 text-sm text-muted">{online && mine ? busyText : waitingText}</p>;
}

/** Pick which flyer events go on the plan, and on which day. */
function FlyerEvents({
  events,
  days,
  units,
  used,
  fallbackDay,
  onAdd,
}: {
  events: FlyerEvent[];
  days: DayChoice[];
  units: "imperial" | "metric";
  used: boolean;
  fallbackDay: string | null;
  onAdd: (picks: { dayDate: string; item: PlanItemDraft }[]) => void;
}) {
  const dates = days.map((d) => d.date);
  const [rows, setRows] = useState(() =>
    events.map((e) => {
      const onTrip = eventDay(e, dates);
      return { on: onTrip !== null, day: onTrip ?? fallbackDay ?? dates[0] ?? "" };
    })
  );
  if (events.length === 0) return <p className="mt-3 text-sm text-muted">No events found on this one.</p>;
  const picked = rows.filter((r) => r.on && r.day).length;
  const time = (t: string | null) => (toMinutes(t) === null ? null : t);

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">On the flyer</p>
      <ul className="space-y-2">
        {events.map((e, i) => (
          <li key={i} className="rounded-xl border border-border p-3">
            <label className="flex items-start gap-3">
              {!used && days.length > 0 && (
                <input
                  type="checkbox"
                  checked={rows[i].on}
                  onChange={() => setRows((r) => r.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                />
              )}
              <span className="min-w-0 text-sm">
                <span className="font-medium">{e.title}</span>
                <span className="block text-xs text-muted">
                  {[e.date, time(e.start) && formatTime(e.start, units), e.place].filter(Boolean).join(" · ") || "No day or time on the flyer"}
                </span>
                {e.notes && <span className="block text-xs text-muted">{e.notes}</span>}
              </span>
            </label>
            {!used && rows[i].on && days.length > 0 && (
              <select
                aria-label={`Day for ${e.title}`}
                value={rows[i].day}
                onChange={(ev) => setRows((r) => r.map((x, j) => (j === i ? { ...x, day: ev.target.value } : x)))}
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-bg px-2 text-sm"
              >
                {days.map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
      {used ? (
        <p className="text-xs text-ok">Added to the plan.</p>
      ) : (
        days.length > 0 && (
          <button
            type="button"
            disabled={picked === 0}
            onClick={() =>
              onAdd(
                events
                  .map((e, i) => ({ e, r: rows[i] }))
                  .filter(({ r }) => r.on && r.day)
                  .map(({ e, r }) => ({
                    dayDate: r.day,
                    item: {
                      kind: "activity" as const,
                      title: e.title.slice(0, 200),
                      start: time(e.start),
                      end: time(e.end),
                      place: e.place,
                      notes: e.notes || "From a flyer",
                    },
                  }))
              )
            }
            className="min-h-11 w-full rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            Add {picked} to the plan
          </button>
        )
      )}
    </div>
  );
}
