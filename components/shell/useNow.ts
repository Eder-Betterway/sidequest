"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed every `everyMs`, so "synced 2 min ago" keeps counting. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
