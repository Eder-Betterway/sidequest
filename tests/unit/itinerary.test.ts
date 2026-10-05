import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as reroute } from "@/app/api/ai/reroute/route";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { reroutePrompt } from "@/lib/ai/prompts/reroute";
import { formatWeatherBrief, stays } from "@/lib/grounding/weather-brief";
import { defaultInputs } from "@/lib/model/inputs";
import type { StoredItem } from "@/lib/model/plan";
import { previewItems } from "@/lib/plan/brief";
import { buildTripChanges, tripStale } from "@/lib/plan/tripProposal";

const item = (id: string, dayDate: string, title: string, patch: Partial<StoredItem> = {}): StoredItem => ({
  id,
  dayDate,
  title,
  kind: "activity",
  start: "09:00",
  end: null,
  place: null,
  notes: "",
  order: 0,
  locked: false,
  source: "ai",
  milestoneId: null,
  updatedAt: 1,
  updatedBy: "me@example.com",
  ...patch,
});

const days = [
  { date: "2026-11-02", base: "Joshua Tree", title: "Arrive", updatedAt: 10 },
  { date: "2026-11-03", base: "Joshua Tree", title: "Rocks", updatedAt: 11 },
  { date: "2026-11-04", base: "Joshua Tree", title: "Last day", updatedAt: 12 },
];
const items = [
  item("a", "2026-11-03", "Hike"),
  item("b", "2026-11-04", "Hike again"),
  item("w", "2026-11-04", "Wedding", { kind: "milestone", locked: true, start: "16:00" }),
];
const place = { name: "Palm Springs", lat: 33.8, lng: -116.5, timezone: "America/Los_Angeles", countryCode: "US" };

describe("trip-wide suggestions", () => {
  it("keeps only the days that really change, with their base move and item changes", () => {
    const { changes, basedOn } = buildTripChanges(days, items, [
      { date: "2026-11-03", base: "Joshua Tree", title: "Rocks", place: null, items: [{ kind: "activity", title: "Hike", start: "09:00", end: null, place: null, notes: "" }] },
      {
        date: "2026-11-04",
        base: "Palm Springs",
        title: "Wedding day",
        place,
        items: [
          { kind: "activity", title: "Pool morning", start: "10:00", end: null, place: null, notes: "" },
          // Echoed locked item: ignored.
          { kind: "milestone", title: "Wedding", start: "16:00", end: null, place: null, notes: "" },
        ],
      },
      { date: "2027-01-01", base: "Nowhere", title: "x", place: null, items: [] },
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      date: "2026-11-04",
      before: { base: "Joshua Tree", title: "Last day" },
      after: { base: "Palm Springs", title: "Wedding day", place },
    });
    expect(changes[0].ops.map((o) => o.op)).toEqual(["add", "remove"]);
    expect(basedOn).toEqual({ "day:2026-11-04": 12, b: 1, w: 1 });
  });

  it("a day that stays put keeps its known location", () => {
    const { changes } = buildTripChanges(days, items, [{ date: "2026-11-02", base: "Joshua Tree", title: "Arrive slowly", place, items: [] }]);
    expect(changes[0].after.place).toBeNull();
  });

  it("spots a suggestion the plan has moved past", () => {
    const p = { basedOn: { "day:2026-11-04": 12, b: 1 } };
    expect(tripStale(p, days, items)).toBe(false);
    expect(tripStale(p, days.map((d) => ({ ...d, updatedAt: d.updatedAt + 1 })), items)).toBe(true);
    expect(tripStale(p, days, items.filter((i) => i.id !== "b"))).toBe(true);
  });
});

describe("the itinerary", () => {
  it("previews a few items but never hides milestones or bookings", () => {
    const list = ["1", "2", "3", "4", "5"].map((n) => ({ id: n, kind: "activity", locked: false }));
    list.push({ id: "m", kind: "milestone", locked: true });
    expect(previewItems(list).map((i) => i.id)).toEqual(["1", "2", "3", "m"]);
    expect(previewItems(list.slice(0, 2)).map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("puts trip rules in every planning brief", () => {
    const brief = describeTrip({ title: "x", startDate: "2026-11-02", endDate: "2026-11-04" }, { ...defaultInputs(), rules: ["On 2026-11-04: stay in Palm Springs"] }, "2026-10-01");
    expect(brief).toContain("- Rules they've set (always follow these):\n  - On 2026-11-04: stay in Palm Springs");
  });

  it("shows the planner the whole trip, the weather, and the request", () => {
    const p = reroutePrompt(
      "Trip: x",
      [{ date: "2026-11-04", base: "Joshua Tree", title: "Last day", items: [{ kind: "milestone", title: "Wedding", start: "16:00", end: null, place: "Palm Springs", notes: "", locked: true }] }],
      "Stay in Palm Springs",
      "2026-11-04",
      "- Joshua Tree: sunny"
    );
    expect(p).toContain('- 2026-11-04: Joshua Tree ("Last day")\n    - LOCKED 16:00 [milestone] Wedding @ Palm Springs');
    expect(p).toContain("Weather by stop:\n- Joshua Tree: sunny");
    expect(p).toContain("What they want (asked from 2026-11-04): Stay in Palm Springs");
  });
});

describe("weather for whole-trip questions", () => {
  it("groups the trip into stays with known locations", () => {
    expect(
      stays([
        { date: "2026-11-02", base: "A", lat: 1, lng: 2 },
        { date: "2026-11-03", base: "A", lat: 1, lng: 2 },
        { date: "2026-11-04", base: "B", lat: null, lng: null },
        { date: "2026-11-05", base: "C", lat: 3, lng: 4 },
      ])
    ).toEqual([
      { base: "A", from: "2026-11-02", to: "2026-11-03", lat: 1, lng: 2 },
      { base: "C", from: "2026-11-05", to: "2026-11-05", lat: 3, lng: 4 },
    ]);
  });

  it("writes one short line per stay and says when it isn't a forecast", () => {
    const stay = { base: "Palm Springs", from: "2026-11-02", to: "2026-11-03", lat: 1, lng: 2 };
    expect(
      formatWeatherBrief([
        {
          stay,
          kind: "last-year",
          days: [
            { date: "2026-11-02", high: 29.6, low: 14.2, rain: 0, rainUnit: "mm", label: "Clear" },
            { date: "2026-11-03", high: null, low: null, rain: null, rainUnit: "%", label: "" },
          ],
        },
        { stay, kind: "forecast", days: [] },
      ])
    ).toBe("- Palm Springs, 2026-11-02 to 2026-11-03 (last year, not a forecast): 11-02 Clear 30/14°C, 0 mm rain; 11-03 ?");
  });
});

// ---------- Route ----------

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
  new Request("http://localhost/api/ai/reroute", {
    method: "POST",
    headers: { "content-type": "application/json", ...(email ? { authorization: `Bearer ${token(email)}` } : {}) },
    body: JSON.stringify(body),
  });

describe("POST /api/ai/reroute", () => {
  const body = {
    trip: { title: "Wedding weekend", startDate: "2026-11-02", endDate: "2026-11-04" },
    inputs: { ...defaultInputs(), regions: ["Joshua Tree"], modes: ["campervan"] },
    days: days.map((d) => ({ date: d.date, base: d.base, title: d.title, items: [] })),
    instruction: "Stay in Palm Springs on the 4th",
    focusDate: "2026-11-04",
    today: "2026-10-01",
  };

  it("401s signed out, 403s strangers, 400s without a request", async () => {
    expect((await reroute(post(body, null))).status).toBe(401);
    expect((await reroute(post(body, "stranger@example.com"))).status).toBe(403);
    expect((await reroute(post({ ...body, instruction: "" }))).status).toBe(400);
  });

  it("returns only changed days, with new bases looked up on the map", async () => {
    const res = await reroute(post(body));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
    // Progress first, one event per line, then the result.
    const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(events.filter((e) => e.type === "progress").map((e) => e.stage)).toEqual(["reading", "thinking", "writing", "places"]);
    const last = events[events.length - 1];
    expect(last.type).toBe("result");
    const json = last.data;
    expect(json.days).toHaveLength(1);
    expect(json.days[0]).toMatchObject({ date: "2026-11-04", base: "Palm Springs", place: { name: "Palm Springs" } });
  });
});

describe("draft changes", () => {
  it("validates drafts and stamps who wrote them", async () => {
    const { buildDraft } = await import("@/lib/model/draft");
    expect(buildDraft({ text: "  Stay longer ", dayDate: "2026-11-04", rule: true }, "Me@Example.com")).toEqual({
      ok: true,
      draft: { text: "Stay longer", dayDate: "2026-11-04", rule: true, createdBy: "me@example.com" },
    });
    expect(buildDraft({ text: " ", dayDate: null, rule: false }, "me@example.com").ok).toBe(false);
    expect(buildDraft({ text: "x".repeat(601), dayDate: null, rule: false }, "me@example.com").ok).toBe(false);
  });

  it("scopes drafts to a day, or all of them for the whole trip", async () => {
    const { draftsFor } = await import("@/lib/model/draft");
    const list = [{ dayDate: "2026-11-03" }, { dayDate: "2026-11-04" }, { dayDate: null }];
    expect(draftsFor(list, "2026-11-04")).toEqual([{ dayDate: "2026-11-04" }]);
    expect(draftsFor(list, null)).toHaveLength(3);
  });

  it("sends one request as written, and several as one dated list", async () => {
    const { combineRequests, ruleText } = await import("@/lib/model/draft");
    expect(combineRequests([{ text: "Stay longer", dayDate: "2026-11-04" }], "2026-11-04")).toEqual({
      instruction: "Stay longer",
      focusDate: "2026-11-04",
    });
    expect(
      combineRequests(
        [
          { text: "Less driving", dayDate: null },
          { text: "Stay longer", dayDate: "2026-11-04" },
          { text: "Arrive early", dayDate: "2026-11-03" },
        ],
        null
      )
    ).toEqual({
      instruction: "Make all of these changes together:\n- Whole trip: Less driving\n- On 2026-11-03: Arrive early\n- On 2026-11-04: Stay longer",
      focusDate: null,
    });
    // All about the open day: still focused on it.
    expect(combineRequests([{ text: "a", dayDate: "2026-11-04" }, { text: "b", dayDate: "2026-11-04" }], "2026-11-04").focusDate).toBe("2026-11-04");
    expect(ruleText({ text: " Stay ", dayDate: "2026-11-04" })).toBe("On 2026-11-04: Stay");
    expect(ruleText({ text: "No night driving", dayDate: null })).toBe("No night driving");
  });
});
