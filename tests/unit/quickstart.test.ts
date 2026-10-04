import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as quickstart } from "@/app/api/ai/quickstart/route";
import { mockQuickStart } from "@/lib/ai/mocks";
import { quickstartPrompt } from "@/lib/ai/prompts/quickstart";
import { summarize, toTripStart, type QuickStart } from "@/lib/model/quickstart";

const TODAY = "2026-10-04";
const base: QuickStart = { ...mockQuickStart(TODAY) };

describe("quick start", () => {
  it("turns a description into a trip with dates, places, a milestone, and the van", () => {
    const t = toTripStart(base, TODAY, 1);
    expect(t).toMatchObject({ title: "Desert wedding loop", startDate: "2026-11-03", endDate: "2026-11-16" });
    expect(t.inputs.regions).toEqual(["Joshua Tree, California", "Palm Springs, California"]);
    expect(t.inputs.milestones).toEqual([
      expect.objectContaining({ id: "m_1_0", title: "Friends' wedding", date: "2026-11-15", time: "16:00", priority: "required", bufferBeforeDays: 0 }),
    ]);
    expect(t.inputs.modes).toEqual(["campervan"]);
    expect(t.inputs.sharedInterests).toEqual(["climbing", "hot springs"]);
    expect(t.inputs.vibe.pace).toBe(25);
    // Everything not said keeps the usual defaults.
    expect(t.inputs).toMatchObject({ budget: "comfortable", units: "imperial", rules: [], vehicle: null });
  });

  it("drops what doesn't hold up instead of failing", () => {
    const t = toTripStart(
      {
        ...base,
        title: "  ",
        startDate: "2025-01-01", // in the past
        endDate: "2026-12-01",
        milestones: [{ ...base.milestones[0], date: "Nov 15" }, { ...base.milestones[0], time: "4pm" }],
        maxDriveHoursPerDay: 0,
        regions: ["Joshua Tree", "Joshua Tree", " "],
        vehicle: { lengthM: -1, heightM: null, weightT: null, rangeKm: null, fourWheelDrive: null, notes: null },
      },
      TODAY
    );
    expect(t.title).toBe("New trip");
    expect(t.startDate).toBeNull();
    expect(t.endDate).toBeNull();
    expect(t.inputs.milestones).toHaveLength(1);
    expect(t.inputs.milestones[0].time).toBeNull();
    expect(t.inputs.maxDriveHoursPerDay).toBeNull();
    expect(t.inputs.regions).toEqual(["Joshua Tree"]);
    expect(t.inputs.vehicle).toBeNull();
    expect(toTripStart({ ...base, endDate: "2026-11-01" }, TODAY).endDate).toBeNull();
  });

  it("keeps the van details it was given, in meters", () => {
    const t = toTripStart({ ...base, vehicle: { lengthM: 6.4, heightM: 2.7, weightT: null, rangeKm: 600, fourWheelDrive: true, notes: "pop-top" } }, TODAY);
    expect(t.inputs.vehicle).toMatchObject({ lengthM: 6.4, heightM: 2.7, rangeKm: 600, fourWheelDrive: true, notes: "pop-top", widthM: null });
  });

  it("summarizes what got filled in for review", () => {
    const rows = summarize(toTripStart(base, TODAY));
    expect(rows.map((r) => r.label)).toEqual(["Places", "Milestones", "Getting around", "Into"]);
    expect(rows[1].value).toBe("Friends' wedding (2026-11-15 16:00)");
  });

  it("tells Claude today's weekday so 'the 14th' resolves", () => {
    expect(quickstartPrompt("wedding on the 14th", TODAY)).toContain("Today is Sunday 2026-10-04.");
  });
});

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
const post = (body: unknown, email: string | null = "me@example.com") =>
  new Request("http://localhost/api/ai/quickstart", {
    method: "POST",
    headers: { "content-type": "application/json", ...(email ? { authorization: `Bearer ${token(email)}` } : {}) },
    body: JSON.stringify(body),
  });

describe("POST /api/ai/quickstart", () => {
  it("guards and validates", async () => {
    expect((await quickstart(post({ text: "Two weeks in the desert", today: TODAY }, null))).status).toBe(401);
    expect((await quickstart(post({ text: "Two weeks in the desert", today: TODAY }, "stranger@example.com"))).status).toBe(403);
    expect((await quickstart(post({ text: "hi", today: TODAY }))).status).toBe(400);
  });

  it("returns trip details to review", async () => {
    const res = await quickstart(post({ text: "Two weeks in the desert in the van", today: TODAY }));
    expect(res.status).toBe(200);
    expect((await res.json()).start.title).toBe("Desert wedding loop");
  });
});
