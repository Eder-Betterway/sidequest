/**
 * Long AI jobs report progress to the phone as they go: the route answers
 * with newline-delimited JSON, one event per line, ending in a result or an
 * error. The server half is in stream-job.ts; this file is safe on the phone.
 */

export type JobStage = "reading" | "thinking" | "searching" | "writing" | "places" | "saving";

export type JobEvent =
  | { type: "progress"; stage: JobStage; count?: number; total?: number }
  | { type: "tick" }
  /** The server is tracking this job on the trip and will save the result itself. */
  | { type: "job"; id: string }
  | { type: "result"; data: unknown }
  | { type: "error"; status: number; error: string };

export const NDJSON = "application/x-ndjson";

/** How many times a key appears in the JSON streamed in so far: one per day, option, or item written. */
export function countKey(soFar: string, key: string): number {
  return soFar.match(new RegExp(`"${key}"\\s*:`, "g"))?.length ?? 0;
}

/** How many days Claude has written so far. */
export function daysWritten(soFar: string): number {
  return countKey(soFar, "date");
}

/** Calls `progress` only when the count changes, so a fast stream doesn't flood the phone. */
export function onCount(key: string, report: (count: number) => void): (soFar: string) => void {
  let last = -1;
  return (soFar) => {
    const n = countKey(soFar, key);
    if (n !== last) {
      last = n;
      report(n);
    }
  };
}
