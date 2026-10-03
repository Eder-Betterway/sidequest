"use client";

import { useState } from "react";
import TabBar, { TABS, type TabId } from "./TabBar";
import StatusLine from "./StatusLine";

// What each tab will hold, and which build step brings it. These cards go away
// as the real screens land.
const COMING: Record<TabId, { title: string; body: string; steps: string[] }> = {
  trips: {
    title: "Your trips",
    body: "Start a trip from loose dates, regions, must-dos, and how you're getting around. Sidequest drafts three different takes on it and you pick one.",
    steps: ["Sign in and shared trips", "Trip inputs, 3 options, day plan"],
  },
  plan: {
    title: "Day by day",
    body: "Each day as a timeline with sun times, drive legs, and lock toggles. Dial a day toward chill or packed and re-plan around whatever you've locked.",
    steps: ["Vibe dials and re-planning", "Place deep-dives", "Campervan smarts"],
  },
  notes: {
    title: "Notes and local tips",
    body: "Jot what a local told you, snap a flyer, or ask a question. Works with no signal, and turns into plan changes you accept or skip.",
    steps: ["Local tips into the plan"],
  },
  ask: {
    title: "Ask anything",
    body: "Questions about the trip, answered with your plan and notes in mind.",
    steps: ["Local tips into the plan"],
  },
};

export default function AppShell() {
  const [tab, setTab] = useState<TabId>("trips");
  const card = COMING[tab];
  const label = TABS.find((t) => t.id === tab)?.label;

  return (
    <div className="flex h-full flex-col">
      <header className="pt-safe border-b border-border bg-surface">
        <div className="mx-auto flex max-w-xl items-end justify-between px-4 pb-3 pt-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Sidequest</h1>
            <StatusLine />
          </div>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">{label}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-4 py-6">
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-lg font-semibold">{card.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{card.body}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Coming in</p>
            <ul className="mt-2 space-y-1.5">
              {card.steps.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </section>
          <p className="mt-6 text-center text-xs text-muted">
            Add Sidequest to your home screen so it opens without signal.
          </p>
        </div>
      </main>

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
