"use client";

import { useNow } from "@/components/shell/useNow";
import type { JobEvent, JobStage } from "@/lib/ai/progress";

export interface JobState {
  stage: JobStage;
  /** Things written so far (days, options, items) or web searches run. */
  count: number;
  /** How many to expect, when known. */
  total?: number;
  startedAt: number;
}

/** A job that just started. */
export function startJob(): JobState {
  return { stage: "reading", count: 0, startedAt: Date.now() };
}

/** Fold a progress event from the server into the job. */
export function advance(job: JobState, e: Extract<JobEvent, { type: "progress" }>): JobState {
  return { ...job, stage: e.stage, count: e.count ?? (e.stage === job.stage ? job.count : 0), total: e.total ?? job.total };
}

export type JobLabels = Partial<Record<JobStage, string>>;

const DEFAULT_LABELS: Record<JobStage, string> = {
  reading: "Reading your trip",
  thinking: "Claude is thinking it through",
  searching: "Searching the web",
  writing: "Claude is writing",
  places: "Looking up places on the map",
  saving: "Saving",
};

/**
 * How far along a long AI job is. The bar moves with real stages and counts,
 * and creeps within the slow ones (scaled to how long this kind of job usually
 * takes), so it never sits still or claims to be done early.
 */
export function jobPercent(job: JobState, now: number, typicalSecs = 90, expected = 1): number {
  const secs = Math.max(0, (now - job.startedAt) / 1000);
  const creep = (from: number, cap: number, halfLife: number) => from + (cap - from) * (1 - Math.pow(0.5, secs / halfLife));
  const total = job.total ?? expected;
  switch (job.stage) {
    case "reading":
      return Math.min(8, creep(2, 8, 4));
    case "thinking":
      return creep(8, 35, typicalSecs * 0.3);
    case "searching":
      return Math.max(Math.min(60, 10 + job.count * 10), creep(8, 60, typicalSecs * 0.4));
    case "writing": {
      const share = total > 0 ? Math.min(job.count / total, 1) : 0;
      return Math.max(35 + 55 * share, Math.min(88, creep(35, 88, typicalSecs * 0.6)));
    }
    case "places":
      return 93;
    case "saving":
      return 98;
    default:
      return 50;
  }
}

export default function JobProgress({
  job,
  labels,
  unit = "so far",
  typicalSecs = 90,
  expected = 1,
}: {
  job: JobState;
  labels?: JobLabels;
  /** How to show the count, e.g. "days" gives "(3 of 7 days)" or "(3 days so far)". */
  unit?: string;
  /** How long this kind of job usually takes, for the bar and the hint. */
  typicalSecs?: number;
  /** How many things to expect when the server doesn't say. */
  expected?: number;
}) {
  const now = useNow(1000);
  const pct = Math.round(jobPercent(job, now, typicalSecs, expected));
  const secs = Math.max(0, Math.floor((now - job.startedAt) / 1000));
  const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const label = labels?.[job.stage] ?? DEFAULT_LABELS[job.stage];
  const counted = (job.stage === "writing" || job.stage === "searching") && job.count > 0;
  const countText = !counted
    ? "..."
    : job.stage === "searching"
      ? ` (${job.count} ${job.count === 1 ? "search" : "searches"})`
      : job.total
        ? ` (${job.count} of ${job.total}${unit === "so far" ? "" : ` ${unit}`})`
        : ` (${job.count}${unit === "so far" ? " so far" : ` ${unit} so far`})`;
  const typical = typicalSecs <= 45 ? "Usually under a minute." : typicalSecs <= 120 ? "Usually 1 to 2 minutes." : "Usually 2 to 4 minutes.";
  return (
    <div role="status" aria-label="Progress" className="rounded-xl bg-surface-2 p-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">
          {label}
          {countText}
        </span>
        <span className="tabular-nums text-muted">{elapsed}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Working" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-2 rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {secs < typicalSecs ? typical : "Taking a little longer than usual."} Keep the app open.
      </p>
    </div>
  );
}
