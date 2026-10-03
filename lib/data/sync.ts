/**
 * Sync state for the status line: how many changes on this phone are still
 * waiting for the server, and when the server last confirmed everything.
 *
 * Each live Firestore listener reports in under its own key, so two listeners
 * (trips list, an open trip) don't overwrite each other's counts.
 */

export interface SyncSnapshot {
  pendingWrites: number;
  lastSyncedAt: number | null;
}

const STORAGE_KEY = "sidequest_last_synced_at";

type Listener = () => void;

export function createSyncStore(storage?: Pick<Storage, "getItem" | "setItem">) {
  const pending = new Map<string, number>();
  const listeners = new Set<Listener>();

  let lastSyncedAt: number | null = null;
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    lastSyncedAt = raw ? Number(raw) || null : null;
  } catch {
    // storage blocked; start unknown
  }

  let snapshot: SyncSnapshot = { pendingWrites: 0, lastSyncedAt };

  function publish() {
    let total = 0;
    for (const n of pending.values()) total += n;
    if (total !== snapshot.pendingWrites || lastSyncedAt !== snapshot.lastSyncedAt) {
      snapshot = { pendingWrites: total, lastSyncedAt };
      listeners.forEach((l) => l());
    }
  }

  return {
    /**
     * Called on every snapshot a listener receives. `fromServer` means the data
     * came from the server rather than the local cache.
     */
    report(key: string, info: { pendingWrites: number; fromServer: boolean }, now: number) {
      pending.set(key, info.pendingWrites);
      if (info.fromServer && info.pendingWrites === 0) {
        lastSyncedAt = now;
        try {
          storage?.setItem(STORAGE_KEY, String(now));
        } catch {
          // ignore
        }
      }
      publish();
    },
    /** A listener stopped; its pending count no longer applies. */
    forget(key: string) {
      pending.delete(key);
      publish();
    },
    get: (): SyncSnapshot => snapshot,
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export type SyncStore = ReturnType<typeof createSyncStore>;

let shared: SyncStore | null = null;

/** The app-wide store (browser only). */
export function syncStore(): SyncStore {
  if (!shared) shared = createSyncStore(typeof localStorage === "undefined" ? undefined : localStorage);
  return shared;
}
