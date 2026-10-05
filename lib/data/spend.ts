"use client";

import { collection, getDocs, query, where } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import type { AiRun } from "@/lib/model/spend";

/**
 * Every logged Claude call since `since`, across the given trips. Read once
 * when Settings opens; with no signal it answers from what's on the phone.
 */
export async function readAiRuns(tripIds: string[], since: number): Promise<AiRun[]> {
  const fb = getFirebase();
  if (!fb) return [];
  const lists = await Promise.all(
    tripIds.map((id) =>
      getDocs(query(collection(fb.db, "trips", id, "aiRuns"), where("at", ">=", since)))
        .then((snap) => snap.docs.map((d) => d.data() as AiRun))
        .catch(() => [] as AiRun[])
    )
  );
  return lists.flat();
}
