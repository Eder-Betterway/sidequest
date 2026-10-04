"use client";

import { useState } from "react";
import TabBar, { type TabId } from "./TabBar";
import StatusLine from "./StatusLine";
import AccountMenu from "./AccountMenu";
import SetupNeeded from "./SetupNeeded";
import SignIn from "@/components/auth/SignIn";
import { useAuth } from "@/components/auth/useAuth";
import { useTrips } from "@/components/trip/useTrips";
import TripsView from "@/components/trip/TripsView";
import PlanView from "@/components/trip/PlanView";
import NotesArea, { NoTripOpen } from "@/components/notes/NotesArea";
import { prefs } from "@/lib/prefs";

export default function AppShell() {
  const auth = useAuth();

  if (auth.status === "loading") return <div className="h-full bg-bg" />;
  if (auth.status === "unconfigured") return <SetupNeeded />;
  if (auth.status === "signedOut") return <SignIn />;
  return <SignedIn email={auth.email} />;
}

function SignedIn({ email }: { email: string }) {
  const trips = useTrips(email);
  const [tab, setTab] = useState<TabId>(() => (prefs.activeTrip() ? "plan" : "trips"));
  const [activeId, setActiveId] = useState<string | null>(() => prefs.activeTrip());
  // "Ask about the trip" on the itinerary opens Ask with a question ready to type.
  const [askNow, setAskNow] = useState(false);

  // A trip deleted on the other phone (or never synced here) just isn't open.
  const active = trips.trips.find((t) => t.id === activeId) ?? null;

  function open(id: string | null) {
    setActiveId(id);
    prefs.setActiveTrip(id);
  }

  const heading = tab !== "trips" && active ? active.title : "Sidequest";

  return (
    <div className="flex h-full flex-col">
      <header className="pt-safe border-b border-border bg-surface">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 pb-3 pt-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight">{heading}</h1>
            <StatusLine />
          </div>
          <AccountMenu email={email} trips={trips.trips} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-4 py-5">
          {tab === "trips" && (
            <TripsView
              email={email}
              state={trips}
              activeId={activeId}
              onOpen={(id) => {
                open(id);
                setTab("plan");
              }}
            />
          )}
          {tab === "plan" &&
            (trips.status === "loading" ? (
              <p className="py-6 text-center text-sm text-muted">Loading...</p>
            ) : (
              <PlanView
                trip={active}
                email={email}
                onDeleted={() => {
                  open(null);
                  setTab("trips");
                }}
                onAskTrip={() => {
                  setAskNow(true);
                  setTab("ask");
                }}
              />
            ))}
          {(tab === "notes" || tab === "ask") &&
            (trips.status === "loading" ? (
              <p className="py-6 text-center text-sm text-muted">Loading...</p>
            ) : active ? (
              // Keyed by trip only, so switching between Notes and Ask keeps work in flight.
              <NotesArea key={active.id} trip={active} email={email} tab={tab} startAsking={askNow} />
            ) : (
              <NoTripOpen />
            ))}
        </div>
      </main>

      <TabBar
        active={tab}
        onChange={(t) => {
          setAskNow(false);
          setTab(t);
        }}
      />
    </div>
  );
}
