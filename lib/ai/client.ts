"use client";

import { getFirebase } from "@/lib/firebase/client";

/**
 * Call one of our /api/ai routes from the phone, with the signed-in user's
 * token. Returns a friendly error instead of throwing.
 */
export type AiCall<T> = { ok: true; data: T } | { ok: false; error: string };

export async function callAi<T>(path: string, body: unknown): Promise<AiCall<T>> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "This needs signal. Try again when you're back online." };
  }
  const user = getFirebase()?.auth.currentUser;
  if (!user) return { ok: false, error: "Sign in first." };
  try {
    const token = await user.getIdToken();
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `Something went wrong (${res.status}).` };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "Lost the connection. Try again when you have signal." };
  }
}

/** Today's date on this phone, YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
