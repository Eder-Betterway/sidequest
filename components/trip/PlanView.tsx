"use client";

import { useState } from "react";
import { deleteTrip } from "@/lib/data/trips";
import { formatTripDates, type Trip } from "@/lib/model/trip";
import { Notice } from "./TripsView";

/**
 * The open trip. For now: its basics and a delete button. The day-by-day plan,
 * dials, and deep-dives land here in the next steps.
 */
export default function PlanView({ trip, onDeleted }: { trip: Trip | null; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (!trip) {
    return <Notice title="No trip open">Pick a trip on the Trips tab, or start a new one.</Notice>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Open trip</p>
        <h2 className="mt-1 text-xl font-bold">{trip.title}</h2>
        <p className="mt-1 text-sm text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
        <p className="mt-0.5 text-sm text-muted">{trip.memberEmails.join(" and ")}</p>
      </section>

      <Notice title="Day plan coming next">
        Next up: the trip inputs (regions, must-dos, how you&apos;re getting around, what you&apos;re into), three
        options to pick from, and a day-by-day timeline.
      </Notice>

      <div className="pt-4">
        {confirming ? (
          <div className="rounded-2xl border border-warn/40 bg-surface p-4">
            <p className="text-sm">Delete &quot;{trip.title}&quot; for everyone on it? This can&apos;t be undone.</p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  deleteTrip(trip.id);
                  onDeleted();
                }}
                className="min-h-11 flex-1 rounded-xl bg-warn font-semibold text-on-accent"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="min-h-11 flex-1 rounded-xl border border-border font-medium"
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="min-h-11 text-sm text-muted underline">
            Delete this trip
          </button>
        )}
      </div>
    </div>
  );
}
