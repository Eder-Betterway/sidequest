import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as reroute } from "@/app/api/ai/reroute/route";
import { commit, toFields } from "@/lib/firebase/rest";
import { defaultInputs } from "@/lib/model/inputs";
import { JOB_STALE_MS, jobView } from "@/lib/model/job";
import { readJobResponse } from "./job";

describe("Firestore over REST", () => {
  it("turns plain values into Firestore fields, leaving out undefined", () => {
    expect(toFields({ a: "x", n: 3, f: 1.5, b: true, z: null, u: undefined, list: [1, "y"], map: { k: "v" } })).toEqual({
      a: { stringValue: "x" },
      n: { integerValue: "3" },
      f: { doubleValue: 1.5 },
      b: { booleanValue: true },
      z: { nullValue: null },
      list: { arrayValue: { values: [{ integerValue: "1" }, { stringValue: "y" }] } },
      map: { mapValue: { fields: { k: { stringValue: "v" } } } },
    });
  });

  it("commits set, update, and delete in one request, signed in as the caller", async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-routes";
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const ok = await commit(
      "tok",
      [
        { set: "trips/t/jobs/j", data: { status: "running" } },
        { update: "trips/t/tripProposals/p", data: { status: "dismissed" } },
        { remove: "trips/t/jobs/j" },
      ],
      fake
    );
    expect(ok).toBe(true);
    expect(calls[0].url).toBe("https://firestore.googleapis.com/v1/projects/demo-routes/databases/(default)/documents:commit");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.writes[0]).toEqual({ update: { name: "projects/demo-routes/databases/(default)/documents/trips/t/jobs/j", fields: { status: { stringValue: "running" } } } });
    expect(body.writes[1]).toMatchObject({ updateMask: { fieldPaths: ["status"] }, currentDocument: { exists: true } });
    expect(body.writes[2]).toEqual({ delete: "projects/demo-routes/databases/(default)/documents/trips/t/jobs/j" });
    expect(await commit("tok", [{ remove: "x/y" }], (async () => new Response("no", { status: 403 })) as unknown as typeof fetch)).toBe(false);
  });

  it("shows running jobs, failed ones until dismissed, and calls a silent one stalled", () => {
    const now = 1_000_000_000;
    expect(jobView({ status: "running", updatedAt: now - 1000 }, now)).toBe("running");
    expect(jobView({ status: "running", updatedAt: now - JOB_STALE_MS - 1 }, now)).toBe("stalled");
    expect(jobView({ status: "failed", updatedAt: now }, now)).toBe("failed");
    expect(jobView({ status: "failed", updatedAt: now, dismissed: true }, now)).toBe("hidden");
  });
});

// ---------- The trip-change route saving on the server ----------

const env = { ...process.env };
let writes: { url: string; body: { writes: Record<string, unknown>[] } }[] = [];
let firestoreStatus = 200;
beforeAll(() => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-routes";
  process.env.ALLOWED_EMAILS = "me@example.com";
  process.env.AI_MOCK = "1";
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (String(url).includes("firestore")) {
      writes.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response("{}", { status: firestoreStatus });
    }
    return new Response("nope", { status: 404 }); // map lookups fall back to estimates
  });
});
afterEach(() => {
  writes = [];
  firestoreStatus = 200;
});
afterAll(() => {
  process.env = env;
  vi.unstubAllGlobals();
});

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({ aud: "demo-routes", sub: "u1", email: "me@example.com" })}.`;
const post = (body: unknown) =>
  new Request("http://localhost/api/ai/reroute", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
const item = (id: string, title: string, extra: object = {}) => ({ id, updatedAt: 5, kind: "activity", title, start: "09:00", end: null, place: null, notes: "", locked: false, ...extra });
const body = {
  trip: { title: "Wedding weekend", startDate: "2026-11-02", endDate: "2026-11-04" },
  inputs: { ...defaultInputs(), regions: ["Joshua Tree"], modes: ["campervan"] },
  days: [
    { date: "2026-11-03", base: "Joshua Tree", title: "Rocks", updatedAt: 11, items: [item("a", "Hike")] },
    { date: "2026-11-04", base: "Joshua Tree", title: "Last day", updatedAt: 12, items: [item("b", "Hike again"), item("w", "Wedding", { kind: "milestone", locked: true, start: "16:00" })] },
  ],
  instruction: "Stay in Palm Springs on the 4th",
  focusDate: "2026-11-04",
  today: "2026-10-01",
  save: { tripId: "trip1", previous: ["old1"], draftIds: ["d1", "d2"], requests: 2 },
};
const all = () => writes.flatMap((w) => w.body.writes);
const named = (w: Record<string, unknown>) => JSON.stringify(w);

describe("POST /api/ai/reroute, saved on the server", () => {
  it("opens a job, saves the suggestion as the caller, and removes the job in the same commit", async () => {
    const { events, data } = await readJobResponse(await reroute(post(body)));
    expect(events[0]).toMatchObject({ type: "job" });
    expect(data.saved).toMatchObject({ changedDays: 1 });

    const first = all()[0] as { update: { name: string; fields: Record<string, { stringValue?: string; integerValue?: string }> } };
    expect(first.update.name).toMatch(/trips\/trip1\/jobs\//);
    expect(first.update.fields.status.stringValue).toBe("running");
    expect(first.update.fields.requests.integerValue).toBe("2");
    expect(first.update.fields.by.stringValue).toBe("me@example.com");

    const last = writes[writes.length - 1].body.writes;
    expect(named(last[0])).toContain("tripProposals/old1");
    expect(named(last[0])).toContain('"dismissed"');
    expect(named(last[1])).toContain(`tripProposals/${data.saved.proposalId}`);
    expect(named(last[1])).toContain('"pending"');
    // The suggestion remembers what it was based on, to spot later edits.
    expect(named(last[1])).toContain('"day:2026-11-04"');
    expect(named(last[1])).toContain('"d2"');
    expect(last[last.length - 1]).toHaveProperty("delete");
    expect(String(last[last.length - 1].delete)).toMatch(/trips\/trip1\/jobs\//);
  });

  it("marks the job failed when Claude can't do it", async () => {
    const { error } = await readJobResponse(await reroute(post({ ...body, instruction: "Slow morning [mock:too-long]" })));
    expect(error).toMatch(/ran too long/);
    const failed = all().find((w) => named(w).includes('"failed"'));
    expect(named(failed!)).toContain("ran too long");
  });

  it("leaves saving to the phone when it can't (older phone, or Firestore says no)", async () => {
    // An older phone doesn't send item ids.
    const old = { ...body, days: body.days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i, id: undefined })) })) };
    let res = await readJobResponse(await reroute(post(old)));
    expect(res.data.saved).toBeNull();
    expect(writes).toHaveLength(0);

    firestoreStatus = 403;
    res = await readJobResponse(await reroute(post(body)));
    expect(res.events.some((e) => e.type === "job")).toBe(false);
    expect(res.data.saved).toBeNull();
    expect(writes).toHaveLength(1); // the refused attempt to open the job, nothing after
  });
});
