import { commit, newDocId, type Write } from "@/lib/firebase/rest";
import type { AiJobDoc } from "@/lib/model/job";
import type { JobStage } from "./progress";

/** Write stage changes at most this often, plus every stage change. */
const COUNT_EVERY_MS = 8000;

/**
 * Keeps `trips/{tripId}/jobs/{id}` current while a job runs, as the person
 * who asked. Every write is best-effort: if Firestore can't be reached, the
 * phone still gets its answer the normal way.
 */
export function tripJob(token: string, tripId: string, by: string, requests: number) {
  const id = newDocId();
  const path = `trips/${tripId}/jobs/${id}`;
  let chain: Promise<unknown> = Promise.resolve();
  let started = false;
  let lastStage: JobStage | null = null;
  let lastWrite = 0;
  const queue = (writes: Write[]) => {
    chain = chain.then(() => commit(token, writes));
    return chain;
  };

  return {
    id,
    /** Opens the job. False if Firestore refused, so the caller can fall back. */
    async start(): Promise<boolean> {
      const now = Date.now();
      const doc: AiJobDoc = { kind: "reroute", status: "running", stage: "reading", count: 0, requests, startedAt: now, updatedAt: now, by };
      started = (await queue([{ set: path, data: { ...doc } }])) === true;
      return started;
    },
    progress(stage: JobStage, count = 0) {
      if (!started) return;
      const now = Date.now();
      if (stage === lastStage && now - lastWrite < COUNT_EVERY_MS) return;
      lastStage = stage;
      lastWrite = now;
      void queue([{ update: path, data: { stage, count, updatedAt: now } }]);
    },
    /** Done: save the result's writes and remove the job in one go. */
    async finish(writes: Write[]): Promise<boolean> {
      if (!started) return false;
      return (await queue([...writes, { remove: path }])) === true;
    },
    async fail(error: string) {
      if (!started) return;
      await queue([{ update: path, data: { status: "failed", error, updatedAt: Date.now() } }]);
    },
  };
}
