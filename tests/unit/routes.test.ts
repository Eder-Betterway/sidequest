import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as options } from "@/app/api/ai/options/route";
import { POST as expand } from "@/app/api/ai/expand/route";
import { POST as replan } from "@/app/api/ai/replan/route";
import { defaultInputs, MilestoneSchema } from "@/lib/model/inputs";

// Unsigned tokens like the Firebase Auth emulator issues; the guard accepts
// them only when FIREBASE_AUTH_EMULATOR_HOST is set (never on Vercel).
const env = { ...process.env };
beforeAll(() => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-routes";
  process.env.ALLOWED_EMAILS = "me@example.com";
  process.env.AI_MOCK = "1";
});
afterAll(() => {
  process.env = env;
});

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (email: string) => `${b64({ alg: "none", typ: "JWT" })}.${b64({ aud: "demo-routes", sub: "u1", email })}.`;

function post(body: unknown, email: string | null = "me@example.com") {
  return new Request("http://localhost/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", ...(email ? { authorization: `Bearer ${token(email)}` } : {}) },
    body: JSON.stringify(body),
  });
}

const trip = { title: "Desert loop", startDate: "2026-10-01", endDate: "2026-10-05" };
const inputs = { ...defaultInputs(), regions: ["Southern Utah", "Northern Arizona"], modes: ["campervan"] };

describe("POST /api/ai/options", () => {
  it("401s signed-out and 403s strangers before doing anything", async () => {
    expect((await options(post({ trip, inputs, today: "2026-09-20" }, null))).status).toBe(401);
    expect((await options(post({ trip, inputs, today: "2026-09-20" }, "stranger@example.com"))).status).toBe(403);
  });

  it("400s with a friendly message when details are missing", async () => {
    const res = await options(post({ trip, inputs: { ...inputs, modes: [] }, today: "2026-09-20" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Add how you're getting around first.");
    expect((await options(post({ nope: true }))).status).toBe(400);
  });

  it("returns three options", async () => {
    const res = await options(post({ trip, inputs, today: "2026-09-20" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toHaveLength(3);
  });

  it("refuses very long trips", async () => {
    const res = await options(post({ trip: { ...trip, endDate: "2027-01-01" }, inputs, today: "2026-09-20" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ai/expand", () => {
  it("returns one day per date with places and the milestone locked", async () => {
    const optRes = await options(post({ trip, inputs, today: "2026-09-20" }));
    const option = (await optRes.json()).options[0];
    const wedding = MilestoneSchema.parse({ id: "m1", title: "Wedding", kind: "wedding", date: "2026-10-03", time: "16:00", priority: "required" });
    const res = await expand(post({ trip, inputs: { ...inputs, milestones: [wedding] }, option, today: "2026-09-20" }));
    expect(res.status).toBe(200);
    const { days } = await res.json();
    expect(days.map((d: { date: string }) => d.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
    expect(days[0].place).toMatchObject({ timezone: "America/Denver" });
    const pinned = days[2].items.find((i: { milestoneId: string | null }) => i.milestoneId === "m1");
    expect(pinned).toMatchObject({ locked: true, kind: "milestone", start: "16:00" });
  });
});

describe("POST /api/ai/replan", () => {
  const day = { date: "2026-10-03", base: "Moab, Utah", title: "Big day" };
  const items = [
    { kind: "activity", title: "Morning hike", start: "08:00", end: "10:00", place: null, notes: "", locked: false },
    { kind: "milestone", title: "Wedding", start: "16:00", end: null, place: null, notes: "", locked: true },
  ];

  it("never returns locked items", async () => {
    const vibe = { pace: 10, effort: 50, path: 50, nights: 50 };
    const res = await replan(post({ trip, inputs, day, items, vibe, today: "2026-09-20" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((i: { title: string }) => i.title)).not.toContain("Wedding");
    expect(body.summary).toMatch(/Slowed/);
  });

  it("guards and validates like the others", async () => {
    const vibe = { pace: 10, effort: 50, path: 50, nights: 50 };
    expect((await replan(post({ trip, inputs, day, items, vibe, today: "2026-09-20" }, null))).status).toBe(401);
    expect((await replan(post({ trip, inputs, day, items, vibe: { pace: 400 }, today: "2026-09-20" }))).status).toBe(400);
  });
});
