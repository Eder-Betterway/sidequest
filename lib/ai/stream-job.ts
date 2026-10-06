import { after } from "next/server";
import { NDJSON, type JobEvent, type JobStage } from "./progress";

/**
 * Answer a route with a stream of progress events (see progress.ts). A
 * heartbeat every few seconds keeps phone networks from dropping a quiet
 * connection, and the work keeps going if the phone disconnects.
 */

const HEARTBEAT_MS = 5000;

export function streamJob(
  run: (
    progress: (
      stage: JobStage,
      extra?: { count?: number; total?: number },
    ) => void,
    announce: (jobId: string) => void,
  ) => Promise<
    { ok: true; data: unknown } | { ok: false; status: number; error: string }
  >,
): Response {
  const enc = new TextEncoder();
  let finished: Promise<void> = Promise.resolve();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      finished = work(controller);
    },
  });
  // Keep working after the response if the phone goes away (screen locked,
  // signal lost), so the job can still finish and save its result.
  try {
    after(() => finished);
  } catch {
    // Outside a request (unit tests): nothing to keep alive.
  }
  return new Response(body, {
    headers: {
      "content-type": NDJSON,
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });

  async function work(controller: ReadableStreamDefaultController<Uint8Array>) {
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
      const res = await run(
        (stage, extra) => send({ type: "progress", stage, ...extra }),
        (id) => send({ type: "job", id }),
      );
      send(
        res.ok
          ? { type: "result", data: res.data }
          : { type: "error", status: res.status, error: res.error },
      );
    } catch (err) {
      console.error("AI job failed", err);
      send({
        type: "error",
        status: 500,
        error: "Something went wrong on the server. Try again.",
      });
    } finally {
      clearInterval(beat);
      try {
        controller.close();
      } catch {
        // already closed by a disconnect
      }
      open = false;
    }
  }
}
