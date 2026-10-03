"use client";

import { useEffect, useState } from "react";
import { watchDays, watchItems, watchOptions, watchProposals } from "@/lib/data/plan";
import type { Proposal } from "@/lib/plan/proposal";
import type { StoredDay, StoredItem, StoredOption } from "@/lib/model/plan";

export interface PlanState {
  loaded: boolean;
  options: (StoredOption & { pending: boolean })[];
  days: (StoredDay & { id: string; pending: boolean })[];
  items: (StoredItem & { pending: boolean })[];
  /** Pending suggestions, newest last. */
  proposals: (Proposal & { pending: boolean })[];
}

/** Live options, days, and items for one trip. Works offline from the phone's copy. */
export function usePlan(tripId: string): PlanState {
  const [options, setOptions] = useState<PlanState["options"] | null>(null);
  const [days, setDays] = useState<PlanState["days"] | null>(null);
  const [items, setItems] = useState<PlanState["items"] | null>(null);
  const [proposals, setProposals] = useState<PlanState["proposals"]>([]);

  useEffect(() => {
    // A brand-new trip may not be readable until it reaches the server; show it
    // as empty meanwhile (the watchers keep retrying) instead of loading forever.
    const empty = <T,>(set: (fn: (prev: T[] | null) => T[] | null) => void) => () => set((prev) => prev ?? []);
    const stops = [
      watchOptions(tripId, setOptions, empty(setOptions)),
      watchDays(tripId, setDays, empty(setDays)),
      watchItems(tripId, setItems, empty(setItems)),
      watchProposals(tripId, (rows) => setProposals([...rows].sort((a, b) => a.createdAt - b.createdAt))),
    ];
    return () => stops.forEach((s) => s());
  }, [tripId]);

  return {
    loaded: options !== null && days !== null && items !== null,
    options: options ?? [],
    days: days ?? [],
    items: items ?? [],
    proposals,
  };
}
