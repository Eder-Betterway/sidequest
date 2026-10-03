"use client";

import { useState } from "react";
import TabBar, { type TabId } from "./TabBar";
import StatusLine from "./StatusLine";
import AccountMenu from "./AccountMenu";
import SetupNeeded from "./SetupNeeded";
import SignIn from "@/components/auth/SignIn";
import { useAuth } from "@/components/auth/useAuth";
import { useTrips } from "@/components/trip/useTrips";
import TripsView, { Notice } from "@/components/trip/TripsView";
import PlanView from "@/components/trip/PlanView";
import { prefs } from "@/lib/prefs";

// Tabs that don't have their real screen yet, and which build step brings it.
const COMING: Partial<Record<TabId, { title: string; body: string }>> = {
  notes: {
    title: "Notes and local tips",
    body: "Jot what a local told you, snap a flyer, or ask a question. Works with no signal, and turns into plan changes you accept or skip. Coming with the local-tips step.",
  },
  ask: {
    title: "Ask anything",
    body: "Questions about the trip, answered with your plan and notes in mind. Coming with the local-tips step.",
  },
};

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

  // A trip deleted on the other phone (or never synced here) just isn't open.
  const active = trips.trips.find((t) => t.id === activeId) ?? null;

  function open(id: string | null) {
    setActiveId(id);
    prefs.setActiveTrip(id);
  }

  const heading = tab === "plan" && active ? active.title : "Sidequest";
  const coming = COMING[tab];

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
                onDeleted={() => {
                  open(null);
                  setTab("trips");
                }}
              />
            ))}
          {coming && <Notice title={coming.title}>{coming.body}</Notice>}
        </div>
      </main>

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
