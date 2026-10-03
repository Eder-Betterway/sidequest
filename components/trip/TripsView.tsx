"use client";

import { useState } from "react";
import { formatTripDates, sortTrips, type Trip } from "@/lib/model/trip";
import type { TripsState } from "./useTrips";
import NewTripSheet from "./NewTripSheet";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function others(trip: Trip, me: string): string {
  const rest = trip.memberEmails.filter((e) => e !== me);
  return rest.length ? `With ${rest.join(", ")}` : "Just you";
}

export default function TripsView({
  email,
  state,
  activeId,
  onOpen,
}: {
  email: string;
  state: TripsState;
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);

  if (state.status === "denied") {
    return (
      <Notice title="This account isn't on the list yet">
        Ask whoever set up Sidequest to add <span className="font-medium text-text">{email}</span> to the allowlist in
        Firebase (docs/SETUP.md, step 3). It works as soon as they do; no need to sign out.
      </Notice>
    );
  }
  if (state.status === "error") {
    return <Notice title="Couldn't load your trips">Close and reopen the app. If it keeps happening, file a Bug issue.</Notice>;
  }

  const trips = sortTrips(state.trips, todayIso());

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent/50 font-semibold text-accent"
      >
        <span aria-hidden className="text-xl leading-none">+</span> New trip
      </button>

      {state.status === "loading" && <p className="py-6 text-center text-sm text-muted">Loading trips...</p>}

      {state.status === "ready" && trips.length === 0 && (
        <Notice title="No trips yet">
          Start one with loose dates and who you&apos;re going with. Everything else can come later.
        </Notice>
      )}

      <ul className="space-y-3">
        {trips.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              className={`w-full rounded-2xl border bg-surface p-4 text-left shadow-sm ${
                t.id === activeId ? "border-accent" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{t.title}</h3>
                {t.pending && (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-warn">
                    waiting to sync
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">{formatTripDates(t.startDate, t.endDate)}</p>
              <p className="mt-0.5 text-xs text-muted">{others(t, email)}</p>
            </button>
          </li>
        ))}
      </ul>

      {creating && (
        <NewTripSheet
          email={email}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onOpen(id);
          }}
        />
      )}
    </div>
  );
}

export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
    </section>
  );
}
