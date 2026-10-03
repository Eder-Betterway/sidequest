/**
 * The little status line at the top of the app: are we online, and when did
 * the trip last reach the server? Pure so it can be tested without a browser.
 */

export interface ConnectionState {
  online: boolean;
  /** Epoch ms of the last confirmed sync, or null if this device never synced. */
  lastSyncedAt: number | null;
  /** Writes made on this phone that the server hasn't confirmed yet. */
  pendingWrites: number;
}

export type Tone = "ok" | "warn" | "muted";

export function connectionLabel(state: ConnectionState, now: number): { text: string; tone: Tone } {
  const { online, lastSyncedAt, pendingWrites } = state;
  const waiting = pendingWrites > 0 ? `${pendingWrites} waiting to sync` : null;

  if (!online) {
    const since = lastSyncedAt === null ? "not synced yet" : `synced ${ago(lastSyncedAt, now)}`;
    return { text: waiting ? `Offline · ${waiting}` : `Offline · ${since}`, tone: "warn" };
  }
  if (waiting) return { text: `Syncing · ${waiting}`, tone: "muted" };
  if (lastSyncedAt === null) return { text: "Online", tone: "ok" };
  return { text: `Synced ${ago(lastSyncedAt, now)}`, tone: "ok" };
}

/** "just now", "4 min ago", "2 h ago", "3 days ago". */
export function ago(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
