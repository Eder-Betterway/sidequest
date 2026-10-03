"use client";

import { useState } from "react";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { getFirebase } from "@/lib/firebase/client";
import { useOnline } from "@/components/shell/useOnline";

function friendly(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "That email and password don't match.";
    case "auth/too-many-requests":
      return "Too many tries. Wait a minute and try again.";
    case "auth/network-request-failed":
      return "No connection. Signing in needs signal, just this once per phone.";
    default:
      return "Something went wrong signing in. Try again.";
  }
}

/**
 * Email and password, on purpose: Google popups and email links break inside
 * an iPhone home-screen app. There's no sign-up; accounts are added in the
 * Firebase console (docs/SETUP.md).
 */
export default function SignIn() {
  const online = useOnline();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "info" } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fb = getFirebase();
    if (!fb) return;
    setBusy(true);
    setMessage(null);
    try {
      await signInWithEmailAndPassword(fb.auth, email.trim(), password);
    } catch (err) {
      setMessage({ text: friendly((err as { code?: string }).code ?? ""), tone: "error" });
      setBusy(false);
    }
  }

  async function reset() {
    const fb = getFirebase();
    if (!fb) return;
    if (!email.trim()) {
      setMessage({ text: "Type your email above first.", tone: "error" });
      return;
    }
    try {
      await sendPasswordResetEmail(fb.auth, email.trim());
    } catch {
      // Same message either way, so it doesn't reveal which emails have accounts.
    }
    setMessage({ text: "If that email has an account, a reset link is on its way.", tone: "info" });
  }

  return (
    <div className="pt-safe flex min-h-full flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">Sidequest</h1>
        <p className="mt-2 text-sm text-muted">Sign in once on this phone. After that it works with no signal.</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-accent"
            />
          </label>

          {message && (
            <p role="alert" className={`text-sm ${message.tone === "error" ? "text-warn" : "text-muted"}`}>
              {message.text}
            </p>
          )}
          {!online && !message && (
            <p className="text-sm text-warn">You&apos;re offline. Signing in needs signal, just this once per phone.</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-60"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <button type="button" onClick={reset} className="mt-4 min-h-11 w-full text-sm text-muted underline">
          Forgot password
        </button>
      </div>
    </div>
  );
}
