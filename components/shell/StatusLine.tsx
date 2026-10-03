"use client";

import { connectionLabel } from "@/lib/connection";
import { useOnline } from "./useOnline";
import { useNow } from "./useNow";

const TONE: Record<string, string> = {
  ok: "text-ok",
  warn: "text-warn",
  muted: "text-muted",
};

/** One line under the header: online/offline, and later "synced 2 min ago". */
export default function StatusLine() {
  const online = useOnline();
  const now = useNow();
  // Sync details arrive with Firebase in the next PR; for now it's online/offline.
  const { text, tone } = connectionLabel({ online, lastSyncedAt: null, pendingWrites: 0 }, now);
  return (
    <p data-testid="status-line" className={`text-xs font-medium ${TONE[tone]}`}>
      <span aria-hidden className="mr-1">●</span>
      {text}
    </p>
  );
}
