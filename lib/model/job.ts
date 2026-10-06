import type { JobStage } from "@/lib/ai/progress";

/**
 * A long AI job the server is working on for a trip (`trips/{id}/jobs/{jobId}`),
 * so both phones can see it, and see how it ended, even if the phone that
 * asked locked or lost signal. Removed when the job succeeds: its result (a
 * suggestion) shows up on its own.
 */
export interface AiJobDoc {
  kind: "reroute";
  status: "running" | "failed";
  stage: JobStage;
  count: number;
  /** Requests included, for "working on 4 changes". */
  requests: number;
  startedAt: number;
  updatedAt: number;
  by: string;
  error?: string;
  dismissed?: boolean;
}

export interface AiJob extends AiJobDoc {
  id: string;
}

/** A running job that hasn't moved in this long died with its server. */
export const JOB_STALE_MS = 6 * 60_000;

export type JobView = "running" | "failed" | "stalled" | "hidden";

export function jobView(job: Pick<AiJobDoc, "status" | "updatedAt" | "dismissed">, now: number): JobView {
  if (job.dismissed) return "hidden";
  if (job.status === "failed") return "failed";
  return now - job.updatedAt > JOB_STALE_MS ? "stalled" : "running";
}
