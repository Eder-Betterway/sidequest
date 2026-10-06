/**
 * Long AI jobs report progress to the phone as they go: the route answers
 * with newline-delimited JSON, one event per line, ending in a result or an
 * error. A heartbeat every few seconds keeps phone networks from dropping a
 * quiet connection.
 */

export type JobStage = "reading" | "thinking" | "searching" | "writing" | "places" | "saving";

export type JobEvent =
  | { type: "progress"; stage: JobStage; count?: number; total?: number }
  | { type: "tick" }
  | { type: "result"; data: unknown }
  | { type: "error"; status: number; error: string };

export const NDJSON = "application/x-ndjson";
const HEARTBEAT_MS = 5000;

export function streamJob(
  run: (progress: (stage: JobStage, extra?: { count?: number; total?: number }) => void) => Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string }>
): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: JobEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false; // the phone went away; finish quietly
        }
      };
      const beat = setInterval(() => send({ type: "tick" }), HEARTBEAT_MS);
      try {
        const res = await run((stage, extra) => send({ type: "progress", stage, ...extra }));
        send(res.ok ? { type: "result", data: res.data } : { type: "error", status: res.status, error: res.error });
      } catch (err) {
        console.error("AI job failed", err);
        send({ type: "error", status: 500, error: "Something went wrong on the server. Try again." });
      } finally {
        clearInterval(beat);
        open = false;
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": NDJSON, "cache-control": "no-store", "x-accel-buffering": "no" } });
}

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
