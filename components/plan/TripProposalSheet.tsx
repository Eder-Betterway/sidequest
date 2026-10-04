"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import type { StoredDay, StoredItem } from "@/lib/model/plan";
import { tripStale, type TripProposal } from "@/lib/plan/tripProposal";
import { longDate } from "./ChangeSheet";
import { OpLine } from "./ProposalSheet";

/** A trip-wide suggestion: one checkbox per changed day. Nothing changes until you apply. */
export default function TripProposalSheet({
  proposal,
  days,
  items,
  units,
  onApply,
  onDismiss,
  onClose,
}: {
  proposal: TripProposal;
  days: StoredDay[];
  items: StoredItem[];
  units: "imperial" | "metric";
  onApply: (keep: Set<string>) => void;
  onDismiss: () => void;
  onClose: () => void;
}) {
  const [keep, setKeep] = useState(() => new Set(proposal.days.map((d) => d.date)));
  const stale = tripStale(proposal, days, items);
  const toggle = (date: string) =>
    setKeep((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  return (
    <Sheet title="Suggested trip changes" onClose={onClose}>
      <p className="text-sm leading-relaxed">{proposal.summary}</p>
      <p className="mt-1 text-xs text-muted">You asked: &quot;{proposal.instruction}&quot;</p>
      {stale && (
        <p role="alert" className="mt-3 rounded-xl bg-accent-soft p-3 text-sm text-warn">
          The plan changed since this was suggested. You can still apply it, or ask again for a fresh one.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {proposal.days.map((d) => {
          const moved = d.after.base !== d.before.base;
          return (
            <li key={d.date} className="rounded-xl border border-border p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={keep.has(d.date)}
                  onChange={() => toggle(d.date)}
                  aria-label={`Apply changes to ${longDate(d.date)}`}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0 text-sm">
                  <span className="font-semibold">{longDate(d.date)}</span>
                  <span className="block">
                    {moved ? (
                      <>
                        Stay in <span className="font-semibold text-accent">{d.after.base}</span>
                        <span className="text-muted"> (was {d.before.base})</span>
                      </>
                    ) : (
                      <span className="text-muted">Still in {d.after.base}</span>
                    )}
                  </span>
                  {d.after.title !== d.before.title && <span className="block text-xs text-muted">&quot;{d.after.title}&quot;</span>}
                </span>
              </label>
              {d.ops.length > 0 && (
                <ul className="mt-2 space-y-1.5 border-t border-border pl-8 pt-2">
                  {d.ops.map((op) => (
                    <li key={op.key}>
                      <OpLine op={op} units={units} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex gap-3">
        <button type="button" onClick={onDismiss} className="min-h-12 flex-1 rounded-xl border border-border font-medium">
          Skip all
        </button>
        <button
          type="button"
          disabled={keep.size === 0}
          onClick={() => onApply(keep)}
          className="min-h-12 flex-[2] rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
        >
          Apply {keep.size} day{keep.size === 1 ? "" : "s"}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-muted">Locked items are never changed.</p>
    </Sheet>
  );
}
