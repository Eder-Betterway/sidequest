"use client";

import { useEffect, useState } from "react";
import { useNow } from "@/components/shell/useNow";
import { dismissJob, watchJobs } from "@/lib/data/jobs";
import { who } from "@/lib/model/history";
import { jobView, type AiJob } from "@/lib/model/job";

const STAGE: Record<string, string> = {
  reading: "reading the trip and the weather",
  thinking: "thinking it through",
  writing: "rewriting days",
  places: "looking up new places",
  saving: "saving the suggestion",
};

/** Look back this far for jobs worth showing. */
const WINDOW_MS = 30 * 60_000;

/**
 * Trip changes Claude is working on, from either phone, even if the phone
 * that asked has locked. The suggestion itself shows up on the itinerary when
 * it's done; this covers the wait, and says so if it failed.
 */
export default function JobsBanner({ tripId, email }: { tripId: string; email: string }) {
  const now = useNow(1000);
  const [since] = useState(() => Date.now() - WINDOW_MS);
  const [jobs, setJobs] = useState<AiJob[]>([]);
  useEffect(() => watchJobs(tripId, since, setJobs), [tripId, since]);

  const shown = jobs.map((j) => ({ job: j, view: jobView(j, now) })).filter((j) => j.view !== "hidden");
  if (shown.length === 0) return null;

  return (
    <div className="space-y-2">
      {shown.map(({ job, view }) => {
        const secs = Math.max(0, Math.floor((now - job.startedAt) / 1000));
        const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
        const asker = who(job.by, email);
        const what = `${job.requests > 1 ? `${job.requests} changes` : "a change"} ${asker === "You" ? "you" : asker} asked for`;
        if (view === "running") {
          return (
            <section key={job.id} role="status" aria-label="Claude is working" className="rounded-2xl border border-accent/40 bg-accent-soft p-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-accent">Claude is working on {what}</span>
                <span className="tabular-nums text-muted">{elapsed}</span>
              </div>
              <p className="mt-1 text-muted">
                Now {STAGE[job.stage] ?? "working"}
                {job.stage === "writing" && job.count > 0 ? ` (${job.count} so far)` : ""}. The suggestion shows up here when it&apos;s ready, even if a phone locks.
              </p>
            </section>
          );
        }
        return (
          <section key={job.id} role="alert" aria-label="Claude couldn't finish" className="rounded-2xl border border-warn/40 bg-surface p-4 text-sm">
            <p className="font-semibold text-warn">Claude couldn&apos;t finish {what}</p>
            <p className="mt-1 text-muted">
              {view === "stalled" ? "It stopped partway, probably a server time limit. Try again, maybe with fewer changes at once." : job.error}
              {" "}The drafts are still saved.
            </p>
            <button type="button" onClick={() => dismissJob(tripId, job.id)} className="mt-2 min-h-11 font-semibold text-accent">
              Got it
            </button>
          </section>
        );
      })}
    </div>
  );
}
