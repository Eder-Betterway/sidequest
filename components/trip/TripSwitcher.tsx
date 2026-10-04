"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { todayIso } from "@/lib/ai/client";
import { formatTripDates, sortTrips, type Trip } from "@/lib/model/trip";
import NewTripSheet from "./NewTripSheet";

function others(trip: Trip, me: string): string {
  const rest = trip.memberEmails.filter((e) => e !== me);
  return rest.length ? `With ${rest.join(", ")}` : "Just you";
}

/**
 * Switch between trips, or start a new one. Opened from the trip name at the
 * top of the app; current and upcoming trips first.
 */
export default function TripSwitcher({
  email,
  trips,
  activeId,
  startNew = false,
  onOpen,
  onClose,
}: {
  email: string;
  trips: Trip[];
  activeId: string | null;
  /** Open straight into the new-trip form. */
  startNew?: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [creating, setCreating] = useState(startNew);

  if (creating) {
    return (
      <NewTripSheet
        email={email}
        onClose={() => (startNew ? onClose() : setCreating(false))}
        onCreated={(id) => {
          onOpen(id);
          onClose();
        }}
      />
    );
  }

  return (
    <Sheet title="Your trips" onClose={onClose}>
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent/50 font-semibold text-accent"
      >
        <span aria-hidden className="text-xl leading-none">+</span> New trip
      </button>
      <ul className="mt-3 space-y-2 pb-2">
        {sortTrips(trips, todayIso()).map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => {
                onOpen(t.id);
                onClose();
              }}
              aria-current={t.id === activeId ? "true" : undefined}
              className={`w-full rounded-2xl border bg-surface p-4 text-left ${t.id === activeId ? "border-accent" : "border-border"}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="font-semibold">{t.title}</span>
                {t.id === activeId && <span className="shrink-0 text-xs font-semibold text-accent">Open</span>}
                {t.pending && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-warn">waiting to sync</span>}
              </span>
              <span className="mt-1 block text-sm text-muted">{formatTripDates(t.startDate, t.endDate)}</span>
              <span className="mt-0.5 block text-xs text-muted">{others(t, email)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
