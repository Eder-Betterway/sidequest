"use client";

import { useEffect, useState } from "react";
import { watchNotes } from "@/lib/data/notes";
import { sortNotes, type Note } from "@/lib/model/note";

/** Live notes for a trip, newest first. Works offline from the phone's copy. */
export function useNotes(tripId: string): { loaded: boolean; notes: Note[] } {
  const [notes, setNotes] = useState<Note[] | null>(null);
  useEffect(
    () =>
      watchNotes(
        tripId,
        (rows) => setNotes(sortNotes(rows)),
        // A brand-new trip may not be readable yet; show it empty meanwhile.
        () => setNotes((prev) => prev ?? [])
      ),
    [tripId]
  );
  return { loaded: notes !== null, notes: notes ?? [] };
}
