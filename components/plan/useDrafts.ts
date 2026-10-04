"use client";

import { useEffect, useState } from "react";
import { watchDrafts } from "@/lib/data/drafts";
import type { ChangeDraft } from "@/lib/model/draft";

/** Live draft changes for a trip, oldest first. */
export function useDrafts(tripId: string): ChangeDraft[] {
  const [drafts, setDrafts] = useState<ChangeDraft[]>([]);
  useEffect(() => watchDrafts(tripId, (rows) => setDrafts([...rows].sort((a, b) => a.createdAt - b.createdAt))), [tripId]);
  return drafts;
}
