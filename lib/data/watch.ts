"use client";

import { collection, onSnapshot, query, type FirestoreError, type QueryConstraint } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import { syncStore } from "./sync";

/**
 * Live view of a collection, offline-first, reporting unsynced writes to the
 * status line. Every record gets its id and a `pending` flag.
 *
 * If the server refuses (most often: a trip created a moment ago hasn't reached
 * the server yet, so the rules can't see who's on it), the listener reports the
 * error and tries again with a growing delay.
 */
export function watchCollection<T>(
  path: string,
  key: string,
  constraints: QueryConstraint[],
  onData: (rows: (T & { id: string; pending: boolean })[]) => void,
  onError?: (err: FirestoreError) => void
): () => void {
  const fb = getFirebase();
  if (!fb) return () => {};
  let stop: (() => void) | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let closed = false;

  const start = () => {
    stop = onSnapshot(
      query(collection(fb.db, path), ...constraints),
      { includeMetadataChanges: true },
      (snap) => {
        attempt = 0;
        const rows = snap.docs.map((d) => ({ ...(d.data() as T), id: d.id, pending: d.metadata.hasPendingWrites }));
        syncStore().report(
          key,
          { pendingWrites: rows.filter((r) => r.pending).length, fromServer: !snap.metadata.fromCache },
          Date.now()
        );
        onData(rows);
      },
      (err) => {
        onError?.(err);
        if (closed) return;
        const delay = Math.min(30_000, 1000 * 2 ** attempt++);
        retry = setTimeout(start, delay);
      }
    );
  };
  start();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    stop?.();
    syncStore().forget(key);
  };
}
