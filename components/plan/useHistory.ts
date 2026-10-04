"use client";

import { useEffect, useState } from "react";
import { watchHistory } from "@/lib/data/history";
import type { HistoryEntry } from "@/lib/model/history";

/** The trip's recent changes, newest first. */
export function useHistory(tripId: string): HistoryEntry[] {
  const [rows, setRows] = useState<HistoryEntry[]>([]);
  useEffect(() => watchHistory(tripId, setRows), [tripId]);
  return rows;
}
