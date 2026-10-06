import { EMULATOR_PROJECT_ID, USE_EMULATORS } from "./config";

/**
 * Server-side Firestore writes through the REST API, signed in as the person
 * who asked (their own Firebase ID token). The security rules apply exactly
 * as they do on the phone, and no service-account key is needed.
 *
 * Used so a long AI job can save its result even if the phone locks or loses
 * signal before the answer arrives.
 */

const EMULATOR_HOST = "127.0.0.1:8180";

type Value =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Record<string, Value> } };

export function toValue(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isSafeInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
  return { stringValue: String(v) };
}

/** Plain object to Firestore fields. Undefined values are left out, like the web SDK's ignoreUndefinedProperties. */
export function toFields(obj: Record<string, unknown>): Record<string, Value> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toValue(v)]));
}

/** A random 20-character id, like Firestore's own. */
export function newDocId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export type Write =
  /** Replace the whole document. */
  | { set: string; data: Record<string, unknown> }
  /** Change only these top-level fields (the document must already exist). */
  | { update: string; data: Record<string, unknown> }
  | { remove: string };

function projectId(): string | null {
  return USE_EMULATORS ? EMULATOR_PROJECT_ID : (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null);
}

export function restConfigured(): boolean {
  return projectId() !== null;
}

/** Apply writes atomically. Paths are relative, like "trips/abc/jobs/xyz". Returns false on any failure. */
export async function commit(token: string, writes: Write[], fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const pid = projectId();
  if (!pid || !token || writes.length === 0) return false;
  const root = `projects/${pid}/databases/(default)/documents`;
  const base = USE_EMULATORS ? `http://${EMULATOR_HOST}/v1/${root}` : `https://firestore.googleapis.com/v1/${root}`;
  const name = (path: string) => `${root}/${path}`;
  const body = {
    writes: writes.map((w) =>
      "remove" in w
        ? { delete: name(w.remove) }
        : "update" in w
          ? { update: { name: name(w.update), fields: toFields(w.data) }, updateMask: { fieldPaths: Object.keys(w.data) }, currentDocument: { exists: true } }
          : { update: { name: name(w.set), fields: toFields(w.data) } }
    ),
  };
  try {
    const res = await fetchImpl(`${base}:commit`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("Firestore REST commit failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
    return res.ok;
  } catch (err) {
    console.error("Firestore REST commit failed", err);
    return false;
  }
}

/** The caller's ID token, already checked by requireMember. */
export function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}
