"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useNow } from "@/components/shell/useNow";
import { undoChange } from "@/lib/data/history";
import { ago, canUndo, changesSince, undoConflicts, who, type HistoryEntry } from "@/lib/model/history";
import type { Note } from "@/lib/model/note";
import type { Trip } from "@/lib/model/trip";
import { prefs } from "@/lib/prefs";
import type { PlanState } from "./usePlan";

/**
 * "Since you last looked": what the other person changed on this trip, so
 * nobody's surprised. "Got it" marks it seen on this phone. "All changes"
 * lists recent changes by both of you, each with Undo.
 */
export default function ChangesCard({
  trip,
  email,
  plan,
  notes,
  history,
}: {
  trip: Trip;
  email: string;
  plan: PlanState;
  notes: Note[];
  history: HistoryEntry[];
}) {
  const now = useNow(60_000);
  // First time on this phone: start counting from now rather than showing everything ever.
  const [lastSeen, setLastSeen] = useState<number>(() => {
    const seen = prefs.lastSeen(trip.id);
    if (seen !== null) return seen;
    const start = Date.now();
    prefs.setLastSeen(trip.id, start);
    return start;
  });
  const [open, setOpen] = useState(false);

  const feed = changesSince(lastSeen, email, history, plan.items, notes);

  function gotIt() {
    // The newest change's own time too: the other phone's clock may run ahead.
    const seen = Math.max(now, ...feed.map((f) => f.at));
    prefs.setLastSeen(trip.id, seen);
    setLastSeen(seen);
  }

  return (
    <>
      {feed.length > 0 ? (
        <section aria-label="Since you last looked" className="rounded-2xl border border-accent/40 bg-accent-soft/40 p-4">
          <h2 className="font-semibold">Since you last looked</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {feed.slice(0, 6).map((f, i) => (
              <li key={i}>
                <span className="font-medium">{who(f.by, email)}</span> {f.text}
                <span className="block text-xs text-muted">{ago(f.at, now)}</span>
              </li>
            ))}
          </ul>
          {feed.length > 6 && <p className="mt-1 text-xs text-muted">and {feed.length - 6} more</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={gotIt} className="min-h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-on-accent">
              Got it
            </button>
            <button type="button" onClick={() => setOpen(true)} className="min-h-11 flex-1 rounded-xl border border-border text-sm font-medium">
              All changes
            </button>
          </div>
        </section>
      ) : (
        history.length > 0 && (
          <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-sm font-medium text-accent">
            Recent changes and undo ›
          </button>
        )
      )}
      {open && <HistorySheet trip={trip} email={email} plan={plan} history={history} now={now} onClose={() => setOpen(false)} />}
    </>
  );
}

function HistorySheet({
  trip,
  email,
  plan,
  history,
  now,
  onClose,
}: {
  trip: Trip;
  email: string;
  plan: PlanState;
  history: HistoryEntry[];
  now: number;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<{ entry: HistoryEntry; conflicts: string[] } | null>(null);

  function undo(entry: HistoryEntry) {
    const conflicts = undoConflicts(entry, plan.items, plan.days);
    if (conflicts.length) return setConfirming({ entry, conflicts });
    undoChange(trip.id, entry, email);
  }

  return (
    <Sheet title="Recent changes" onClose={onClose}>
      {history.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet. Applied suggestions, flyer events, and removed items show up here, with Undo.</p>
      ) : (
        <ul className="space-y-2 pb-2">
          {history.map((h) => (
            <li key={h.id} className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
              <span className="min-w-0 flex-1">
                {h.label}
                <span className="block text-xs text-muted">
                  {who(h.by, email)} · {ago(h.at, now)}
                  {h.undoneAt ? ` · undone by ${who(h.undoneBy ?? "", email)}` : ""}
                </span>
              </span>
              {canUndo(h) && (
                <button type="button" onClick={() => undo(h)} aria-label={`Undo: ${h.label}`} className="min-h-11 shrink-0 px-2 font-semibold text-accent">
                  Undo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirming && (
        <div role="alert" className="sticky bottom-0 mt-3 rounded-xl border border-warn/40 bg-surface p-3 text-sm">
          <p>Some of this changed since: {confirming.conflicts.slice(0, 4).join(", ")}. Undo anyway? Those later edits will be replaced.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                undoChange(trip.id, confirming.entry, email);
                setConfirming(null);
              }}
              className="min-h-11 flex-1 rounded-xl bg-warn font-semibold text-on-accent"
            >
              Undo anyway
            </button>
            <button type="button" onClick={() => setConfirming(null)} className="min-h-11 flex-1 rounded-xl border border-border font-medium">
              Keep it
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
