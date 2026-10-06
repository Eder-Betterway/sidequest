"use client";

import { getFirebase } from "@/lib/firebase/client";
import { NDJSON, type JobEvent } from "./progress";

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
    if (!res.ok) return { ok: false, error: json.error ?? statusError(res.status) };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "Lost the connection. Try again when you have signal." };
  }
}

function statusError(status: number): string {
  if (status === 504) return "The server ran out of time (it has a 5-minute limit). Try fewer changes at once, or one day at a time.";
  if (status === 502 || status === 503) return "The server had a hiccup. Try again in a moment.";
  return `Something went wrong (${status}).`;
}

/**
 * Like callAi, for routes that stream their progress (lib/ai/progress.ts).
 * `onProgress` hears each stage as it happens.
 */
export async function callAiStream<T>(
  path: string,
  body: unknown,
  onProgress: (e: Extract<JobEvent, { type: "progress" }>) => void,
  /** Hears the job id when the server is tracking the job and will save its result itself. */
  onJob?: (id: string) => void
): Promise<AiCall<T> | { ok: false; error: string; dropped: true }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "This needs signal. Try again when you're back online." };
  }
  const user = getFirebase()?.auth.currentUser;
  if (!user) return { ok: false, error: "Sign in first." };
  let res: Response;
  try {
    const token = await user.getIdToken();
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Lost the connection. Try again when you have signal." };
  }
  // Errors before the job starts (sign-in, bad input, a server timeout) come back as plain JSON or HTML.
  if (!res.ok || !res.headers.get("content-type")?.includes(NDJSON) || !res.body) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: json.error ?? statusError(res.status) };
  }
  try {
    const outcome = await readJob(res.body, onProgress, onJob);
    if (outcome) return outcome.type === "result" ? { ok: true, data: outcome.data as T } : { ok: false, error: outcome.error };
  } catch {
    // fall through
  }
  return {
    ok: false,
    dropped: true,
    error: "The connection dropped while Claude was working (this can happen if the screen locks). Try again and keep the app open.",
  };
}

/** Read newline-delimited job events until a result or error arrives. */
export async function readJob(
  stream: ReadableStream<Uint8Array>,
  onProgress: (e: Extract<JobEvent, { type: "progress" }>) => void,
  onJob?: (id: string) => void
): Promise<Extract<JobEvent, { type: "result" | "error" }> | null> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: !done });
    const lines = buf.split("\n");
    buf = done ? "" : lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      let e: JobEvent;
      try {
        e = JSON.parse(line) as JobEvent;
      } catch {
        continue;
      }
      if (e.type === "progress") onProgress(e);
      else if (e.type === "job") onJob?.(e.id);
      else if (e.type === "result" || e.type === "error") return e;
    }
    if (done) return null;
  }
}

/** Today's date on this phone, YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
