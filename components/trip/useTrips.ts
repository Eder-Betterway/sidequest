"use client";

import { useEffect, useState } from "react";
import { watchTrips } from "@/lib/data/trips";
import type { Trip } from "@/lib/model/trip";

export type TripsState =
  | { status: "loading"; trips: Trip[] }
  | { status: "ready"; trips: Trip[] }
  /** Signed in, but not on the allowlist (or rules not pasted in yet). */
  | { status: "denied"; trips: Trip[] }
  | { status: "error"; trips: Trip[] };

/** Live trips for this email. Works offline from the phone's copy. */
export function useTrips(email: string): TripsState {
  const [state, setState] = useState<TripsState>({ status: "loading", trips: [] });

  useEffect(() => {
    return watchTrips(
      email,
      (trips) => setState({ status: "ready", trips }),
      (err) => setState({ status: err.code === "permission-denied" ? "denied" : "error", trips: [] })
    );
  }, [email]);

  return state;
}
