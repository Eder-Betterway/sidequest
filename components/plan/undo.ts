"use client";

import { showToast } from "@/components/ui/toast";
import { undoChange } from "@/lib/data/history";
import type { HistoryEntry } from "@/lib/model/history";

/** After a change: say what happened, with a one-tap Undo. */
export function offerUndo(tripId: string, entry: HistoryEntry, me: string) {
  showToast(`${entry.label}.`, { label: "Undo", run: () => undoChange(tripId, entry, me) });
}
