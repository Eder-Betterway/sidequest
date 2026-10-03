"use client";

import { useSyncExternalStore } from "react";
import { connectionLabel } from "@/lib/connection";
import { syncStore } from "@/lib/data/sync";
import { useOnline } from "./useOnline";
import { useNow } from "./useNow";

const TONE: Record<string, string> = {
  ok: "text-ok",
  warn: "text-warn",
  muted: "text-muted",
};

const NEVER = { pendingWrites: 0, lastSyncedAt: null };

/** One line under the header: online or offline, and when the trip last synced. */
export default function StatusLine() {
  const online = useOnline();
  const now = useNow();
  const sync = useSyncExternalStore(
    (l) => syncStore().subscribe(l),
    () => syncStore().get(),
    () => NEVER
  );
  const { text, tone } = connectionLabel({ online, ...sync }, now);
  return (
    <p data-testid="status-line" className={`text-xs font-medium ${TONE[tone]}`}>
      <span aria-hidden className="mr-1">●</span>
      {text}
    </p>
  );
}
