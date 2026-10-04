"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { formatTime, type StoredItem } from "@/lib/model/plan";
import { isStale, type Proposal, type ProposalOp } from "@/lib/plan/proposal";

/**
 * A suggestion, shown as a list of changes. Everything starts ticked; untick
 * what you don't want, then apply. Nothing changes until you say so.
 */
export default function ProposalSheet({
  proposal,
  dayItems,
  units,
  onApply,
  onDismiss,
  onClose,
}: {
  proposal: Proposal;
  dayItems: StoredItem[];
  units: "imperial" | "metric";
  onApply: (keep: Set<string>) => void;
  onDismiss: () => void;
  onClose: () => void;
}) {
  const [keep, setKeep] = useState(() => new Set(proposal.ops.map((o) => o.key)));
  const stale = isStale(proposal, dayItems);
  const toggle = (key: string) =>
    setKeep((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Sheet title="Suggested changes" onClose={onClose}>
      <p className="text-sm leading-relaxed">{proposal.summary}</p>
      <p className="mt-1 text-xs text-muted">{proposal.reason}</p>

      {stale && (
        <p role="alert" className="mt-3 rounded-xl bg-accent-soft p-3 text-sm text-warn">
          The day changed since this was suggested. You can still apply it, or re-plan again for a fresh one.
        </p>
      )}

      {proposal.ops.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No changes needed. This day already fits.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {proposal.ops.map((op) => (
            <li key={op.key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
                <input
                  type="checkbox"
                  checked={keep.has(op.key)}
                  onChange={() => toggle(op.key)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                />
                <OpLine op={op} units={units} />
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex gap-3">
        <button type="button" onClick={onDismiss} className="min-h-12 flex-1 rounded-xl border border-border font-medium">
          Skip all
        </button>
        <button
          type="button"
          disabled={proposal.ops.length > 0 && keep.size === 0}
          onClick={() => onApply(keep)}
          className="min-h-12 flex-[2] rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
        >
          {proposal.ops.length === 0 ? "OK" : `Apply ${keep.size} change${keep.size === 1 ? "" : "s"}`}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-muted">Locked items are never changed.</p>
    </Sheet>
  );
}

export function OpLine({ op, units }: { op: ProposalOp; units: "imperial" | "metric" }) {
  const when = (s: string | null) => (s ? formatTime(s, units) : "any time");
  if (op.op === "add") {
    return (
      <span className="text-sm">
        <span className="font-semibold text-ok">Add</span> {op.item.title}
        <span className="block text-xs text-muted">{when(op.item.start)}{op.item.place ? ` · ${op.item.place}` : ""}</span>
      </span>
    );
  }
  if (op.op === "remove") {
    return (
      <span className="text-sm">
        <span className="font-semibold text-warn">Drop</span> {op.title}
      </span>
    );
  }
  const changes: string[] = [];
  if (op.before.start !== op.after.start || op.before.end !== op.after.end) changes.push(`${when(op.before.start)} to ${when(op.after.start)}`);
  if (op.before.place !== op.after.place) changes.push(`at ${op.after.place ?? "anywhere"}`);
  if (op.before.notes !== op.after.notes && op.after.notes) changes.push(op.after.notes);
  return (
    <span className="text-sm">
      <span className="font-semibold text-accent">Change</span> {op.after.title}
      <span className="block text-xs text-muted">{changes.join(" · ") || "Small tweaks"}</span>
    </span>
  );
}
