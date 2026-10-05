"use client";

import { useNow } from "@/components/shell/useNow";
import type { JobStage } from "@/lib/ai/progress";

export interface JobState {
  stage: JobStage;
  days: number;
  startedAt: number;
}

/** A job that just started. */
export function startJob(): JobState {
  return { stage: "reading", days: 0, startedAt: Date.now() };
}

const LABEL: Record<JobStage, string> = {
  reading: "Reading your trip and the weather",
  thinking: "Claude is thinking it through",
  writing: "Claude is rewriting days",
  places: "Looking up new places on the map",
  saving: "Saving the suggestion",
};

/**
 * How far along a long AI job is: the stage, a bar, how long it's been, and
 * (while writing) how many days are done. The bar moves with real stages and
 * creeps within the slow ones, so it never sits still or claims to be done.
 */
export function jobPercent(job: JobState, now: number, expectedDays: number): number {
  const secs = Math.max(0, (now - job.startedAt) / 1000);
  // Approaches `cap` over time without reaching it.
  const creep = (from: number, cap: number, halfLife: number) => from + (cap - from) * (1 - Math.pow(0.5, secs / halfLife));
  switch (job.stage) {
    case "reading":
      return Math.min(8, creep(2, 8, 4));
    case "thinking":
      return creep(8, 35, 30);
    case "writing": {
      const share = Math.min(job.days / Math.max(expectedDays, 1), 1);
      return Math.max(35 + 55 * share, Math.min(88, creep(35, 88, 60)));
    }
    case "places":
      return 93;
    case "saving":
      return 98;
  }
}

export default function JobProgress({ job, expectedDays }: { job: JobState; expectedDays: number }) {
  const now = useNow(1000);
  const pct = Math.round(jobPercent(job, now, expectedDays));
  const secs = Math.max(0, Math.floor((now - job.startedAt) / 1000));
  const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <div role="status" aria-label="Progress" className="rounded-xl bg-surface-2 p-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">
          {LABEL[job.stage]}
          {job.stage === "writing" && job.days > 0 ? ` (${job.days} so far)` : "..."}
        </span>
        <span className="tabular-nums text-muted">{elapsed}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Working" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-2 rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {secs < 90 ? "Usually 1 to 2 minutes. Keep the app open." : "Big changes can take up to 4 minutes. Keep the app open."}
      </p>
    </div>
  );
}
