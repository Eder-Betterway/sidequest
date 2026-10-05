"use client";

import { useState } from "react";
import { signOut } from "firebase/auth";
import Sheet from "@/components/ui/Sheet";
import { getFirebase } from "@/lib/firebase/client";
import { buildExport, exportFileName } from "@/lib/data/export";
import type { Trip } from "@/lib/model/trip";
import { Segmented } from "@/components/ui/fields";
import { readAiRuns } from "@/lib/data/spend";
import { who } from "@/lib/model/history";
import { formatUsd, monthStart, summarizeSpend, type SpendSummary } from "@/lib/model/spend";
import { ACCENTS, getAppearance, isDark, setAppearance, type Appearance, type TextSize, type ThemeChoice } from "@/lib/appearance";

const THEMES: Record<string, ThemeChoice> = { "match phone": "auto", light: "light", dark: "dark" };
const SIZES: Record<string, TextSize> = { normal: "normal", large: "large", larger: "larger" };

/** The round initial in the header: who's signed in, how the app looks on this phone, backup, sign out. */
export default function AccountMenu({ email, trips }: { email: string; trips: Trip[] }) {
  const [open, setOpen] = useState(false);
  const [look, setLook] = useState<Appearance | null>(null);
  const [spend, setSpend] = useState<SpendSummary | null>(null);
  const change = (patch: Partial<Appearance>) => setLook(setAppearance(patch));

  function download() {
    const now = Date.now();
    const blob = new Blob([JSON.stringify(buildExport(trips, email, now), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(now);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLook(getAppearance());
          setOpen(true);
          const since = monthStart(Date.now());
          setSpend(null);
          void readAiRuns(trips.map((t) => t.id), since).then((runs) => setSpend(summarizeSpend(runs, since)));
        }}
        aria-label="Account"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-sm font-bold uppercase text-accent"
      >
        {email.charAt(0)}
      </button>
      {open && (
        <Sheet title="Account and settings" onClose={() => setOpen(false)}>
          <p className="text-sm text-muted">Signed in as</p>
          <p className="font-medium">{email}</p>

          {look && (
            <section aria-label="Appearance" className="mt-6 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Appearance on this phone</h3>
              <p className="-mb-2 text-sm font-medium">Theme</p>
              <Segmented
                label="Theme"
                options={Object.keys(THEMES)}
                value={Object.keys(THEMES).find((k) => THEMES[k] === look.theme)!}
                onChange={(k) => change({ theme: THEMES[k] })}
              />
              <div>
                <p className="text-sm font-medium">Color</p>
                <div role="radiogroup" aria-label="Color" className="mt-2 flex flex-wrap gap-3">
                  {ACCENTS.map((a) => {
                    const on = look.accent === a.id;
                    const dark = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={a.name}
                        onClick={() => change({ accent: a.id })}
                        className="flex w-14 flex-col items-center gap-1 text-[11px] text-muted"
                      >
                        <span
                          className={`flex h-11 w-11 items-center justify-center rounded-full ${on ? "ring-2 ring-offset-2 ring-offset-surface" : ""}`}
                          style={{ background: (dark ? a.dark : a.light).accent, ["--tw-ring-color" as string]: (dark ? a.dark : a.light).accent }}
                        >
                          {on && <span className="text-lg font-bold text-on-accent">✓</span>}
                        </span>
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="-mb-2 text-sm font-medium">Text size</p>
              <Segmented
                label="Text size"
                options={Object.keys(SIZES)}
                value={look.text}
                onChange={(k) => change({ text: SIZES[k] })}
              />
              <p className="text-xs text-muted">
                Just for this phone, so you can each pick your own.{" "}
                {look.theme === "auto" && `Right now your phone is in ${isDark("auto", typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) ? "dark" : "light"} mode.`}
              </p>
            </section>
          )}

          <section aria-label="AI spent this month" className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">AI spent this month</h3>
            {!spend ? (
              <p className="mt-1 text-sm text-muted">Adding it up...</p>
            ) : (
              <>
                <p className="mt-1 text-2xl font-bold">{spend.runs ? `About ${formatUsd(spend.total)}` : "$0.00"}</p>
                <p className="text-sm text-muted">
                  {spend.runs
                    ? `${spend.runs} AI ${spend.runs === 1 ? "request" : "requests"} across ${trips.length === 1 ? "your trip" : `your ${trips.length} trips`}`
                    : "Nothing yet this month."}
                </p>
                {spend.runs > 0 && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {spend.byWhat.map((w) => (
                      <li key={w.label} className="flex justify-between gap-3">
                        <span>{w.label}</span>
                        <span className="text-muted">{formatUsd(w.cost)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {spend.byWho.length > 1 && (
                  <ul aria-label="By who" className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
                    {spend.byWho.map((w) => (
                      <li key={w.email} className="flex justify-between gap-3">
                        <span>{who(w.email, email)}</span>
                        <span className="text-muted">{formatUsd(w.cost)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted">
                  An estimate from the app&apos;s own log, on the shared key. The Anthropic console has the real bill; @claude code changes on GitHub aren&apos;t counted here.
                </p>
              </>
            )}
          </section>

          <button
            type="button"
            onClick={download}
            className="mt-6 min-h-12 w-full rounded-xl border border-border font-medium"
          >
            Download a backup (JSON)
          </button>
          <p className="mt-1 text-xs text-muted">{trips.length === 0 ? "Nothing to back up yet." : `A copy of ${trips.length === 1 ? "your trip" : `your ${trips.length} trips`}, just in case.`}</p>

          <button
            type="button"
            onClick={() => {
              const fb = getFirebase();
              if (fb) signOut(fb.auth);
              setOpen(false);
            }}
            className="mt-6 min-h-12 w-full rounded-xl border border-border font-medium text-warn"
          >
            Sign out
          </button>
          <p className="mt-1 text-xs text-muted">Signing back in needs signal.</p>
        </Sheet>
      )}
    </>
  );
}
