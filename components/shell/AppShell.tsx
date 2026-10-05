"use client";

import { useState } from "react";
import TabBar, { type TabId } from "./TabBar";
import StatusLine from "./StatusLine";
import AccountMenu from "./AccountMenu";
import Welcome, { welcomeSeen } from "./Welcome";
import SetupNeeded from "./SetupNeeded";
import SignIn from "@/components/auth/SignIn";
import { useAuth } from "@/components/auth/useAuth";
import { useTrips } from "@/components/trip/useTrips";
import TripSwitcher from "@/components/trip/TripSwitcher";
import PlanView from "@/components/trip/PlanView";
import NotesArea from "@/components/notes/NotesArea";
import TodayView from "@/components/today/TodayView";
import Toast from "@/components/ui/toast";
import { Notice } from "@/components/ui/Notice";
import { todayIso } from "@/lib/ai/client";
import { tripPhase } from "@/lib/plan/today";
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
  // Until you pick a tab: Today mid-trip, otherwise the plan.
  const [chosenTab, setTab] = useState<TabId | null>(null);
  const [activeId, setActiveId] = useState<string | null>(() => prefs.activeTrip());
  const [switcher, setSwitcher] = useState<"list" | "new" | null>(null);
  // Three short screens the first time this phone opens the app.
  const [welcome, setWelcome] = useState(() => !welcomeSeen());
  // A day to open when jumping from Today into the plan.
  const [focus, setFocus] = useState<{ date: string; n: number } | null>(null);

  // A trip deleted on the other phone (or never synced here) just isn't open.
  const active = trips.trips.find((t) => t.id === activeId) ?? null;

  const tab: TabId = chosenTab ?? (active && tripPhase(active, todayIso()) === "during" ? "today" : "plan");

  function open(id: string | null) {
    setActiveId(id);
    prefs.setActiveTrip(id);
    setFocus(null);
  }

  const blocked =
    trips.status === "denied" ? (
      <Notice title="This account isn't on the list yet">
        Ask whoever set up Sidequest to add <span className="font-medium text-text">{email}</span> to the allowlist in Firebase
        (docs/SETUP.md, step 3). It works as soon as they do; no need to sign out.
      </Notice>
    ) : trips.status === "error" ? (
      <Notice title="Couldn't load your trips">Close and reopen the app. If it keeps happening, file a Bug issue.</Notice>
    ) : null;

  const noTrip = (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold">{trips.trips.length ? "No trip open" : "No trips yet"}</h2>
      <p className="mt-2 text-sm text-muted">
        {trips.trips.length
          ? "Pick one, or start a new one."
          : "Start one with loose dates and who you're going with. Everything else can come later."}
      </p>
      <button type="button" onClick={() => setSwitcher("new")} className="mt-3 min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent">
        New trip
      </button>
      {trips.trips.length > 0 && (
        <button type="button" onClick={() => setSwitcher("list")} className="mt-2 min-h-12 w-full rounded-xl border border-border font-semibold">
          Pick a trip
        </button>
      )}
    </section>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="pt-safe border-b border-border bg-surface">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 pb-3 pt-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setSwitcher("list")}
              aria-label={`Switch trip (${active ? active.title : "none open"})`}
              className="flex max-w-full items-center gap-1.5 text-left"
            >
              <h1 className="truncate text-xl font-bold tracking-tight">{active ? active.title : "Sidequest"}</h1>
              <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-muted" fill="currentColor">
                <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <StatusLine />
          </div>
          <AccountMenu email={email} trips={trips.trips} onWelcome={() => setWelcome(true)} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-4 py-5">
          {blocked ??
            (trips.status === "loading" ? (
              <p className="py-6 text-center text-sm text-muted">Loading...</p>
            ) : !active ? (
              noTrip
            ) : tab === "today" ? (
              <TodayView
                key={active.id}
                trip={active}
                email={email}
                onPlan={() => setTab("plan")}
                onOpenDay={(date) => {
                  setFocus((f) => ({ date, n: (f?.n ?? 0) + 1 }));
                  setTab("plan");
                }}
              />
            ) : tab === "plan" ? (
              <PlanView
                // Re-keyed when Today opens a day, so the plan opens on it.
                key={`${active.id}-${focus?.n ?? 0}`}
                trip={active}
                email={email}
                initialDay={focus?.date ?? null}
                onDeleted={() => open(null)}
              />
            ) : (
              <NotesArea key={active.id} trip={active} email={email} />
            ))}
        </div>
      </main>

      <Toast />
      <TabBar active={tab} onChange={setTab} />

      {welcome && <Welcome onDone={() => setWelcome(false)} />}

      {switcher && (
        <TripSwitcher
          email={email}
          trips={trips.trips}
          activeId={activeId}
          startNew={switcher === "new"}
          onOpen={(id) => {
            open(id);
            setTab("plan");
          }}
          onClose={() => setSwitcher(null)}
        />
      )}
    </div>
  );
}
