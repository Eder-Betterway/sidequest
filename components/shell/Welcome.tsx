"use client";

import { useState } from "react";

const SEEN_KEY = "sidequest_welcome_seen";

export function welcomeSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // fine
  }
}

type Phone = "iphone" | "android" | "other";

function phoneKind(): Phone {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Android/.test(ua)) return "android";
  return "other";
}

function installed(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Steps to put the app on the home screen, for this phone. */
export function InstallTips() {
  const phone = phoneKind();
  if (installed()) return <p className="text-sm">You&apos;re already using the home-screen app. Nice.</p>;
  const steps =
    phone === "iphone"
      ? ["Open this page in Safari.", "Tap the Share button (the square with an arrow).", "Scroll down and tap Add to Home Screen, then Add."]
      : phone === "android"
        ? ["Open this page in Chrome.", "Tap the ⋮ menu at the top right.", "Tap Install app (or Add to Home screen)."]
        : ["On iPhone: Safari, Share, Add to Home Screen.", "On Android: Chrome, ⋮ menu, Install app."];
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm">
      {steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}

const SCREENS = [
  {
    title: "Plan the trip together",
    body: (
      <>
        <p>Sidequest is one shared trip on both your phones. Anything either of you changes shows up on the other phone.</p>
        <ul className="mt-3 space-y-2">
          <li>
            <span className="font-semibold">Today:</span> what&apos;s now, what&apos;s next, sunset, and the drive.
          </li>
          <li>
            <span className="font-semibold">Plan:</span> the whole itinerary. Tap a day to open it, or Change to ask Claude for a new take.
          </li>
          <li>
            <span className="font-semibold">Notes:</span> tips, questions, flyers, and shared checklists.
          </li>
        </ul>
        <p className="mt-3">Switch trips by tapping the trip name at the top.</p>
      </>
    ),
  },
  {
    title: "Made for no signal",
    body: (
      <>
        <p>Your plan, notes, and lists live on the phone. Add things anywhere; they sync when you&apos;re back in range.</p>
        <p className="mt-3">
          Before a remote stretch, tap <span className="font-semibold">Get ready for no signal</span> on the Plan tab so each stop&apos;s details, weather, and the drives are saved too.
        </p>
        <p className="mt-3">Asking Claude needs signal. Every AI change comes as a suggestion you accept or skip, and Undo is always there.</p>
      </>
    ),
  },
  {
    title: "Put it on your home screen",
    body: (
      <>
        <p className="mb-3">It opens full screen like a regular app and keeps working offline.</p>
        <InstallTips />
      </>
    ),
  },
];

/** Three short screens the first time this phone opens the app. */
export default function Welcome({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === SCREENS.length - 1;
  const done = () => {
    markSeen();
    onDone();
  };
  const s = SCREENS[step];

  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to Sidequest" className="fixed inset-0 z-50 flex flex-col bg-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex justify-end">
        {!last && (
          <button type="button" onClick={done} className="min-h-11 px-2 text-sm text-muted">
            Skip
          </button>
        )}
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <p className="text-sm font-semibold text-accent">
          {step + 1} of {SCREENS.length}
        </p>
        <h1 className="mt-1 text-2xl font-bold">{s.title}</h1>
        <div className="mt-4 text-base leading-relaxed">{s.body}</div>
      </div>
      <div className="mx-auto flex w-full max-w-md gap-2">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="min-h-12 flex-1 rounded-xl border border-border font-medium">
            Back
          </button>
        )}
        <button
          type="button"
          onClick={() => (last ? done() : setStep(step + 1))}
          className="min-h-12 flex-[2] rounded-xl bg-accent font-semibold text-on-accent"
        >
          {last ? "Let's go" : "Next"}
        </button>
      </div>
    </div>
  );
}
