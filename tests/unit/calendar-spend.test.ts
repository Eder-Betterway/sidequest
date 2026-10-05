import { describe, expect, it } from "vitest";
import type { StoredItem } from "@/lib/model/plan";
import { formatUsd, monthStart, priceFor, runCost, summarizeSpend, type AiRun } from "@/lib/model/spend";
import { buildIcs, escapeText, fold, icsFileName, zonedToUtc } from "@/lib/plan/ics";

const item = (p: Partial<StoredItem> & { id: string; dayDate: string; title: string }): StoredItem => ({
  kind: "activity",
  start: null,
  end: null,
  place: null,
  notes: "",
  order: 0,
  locked: false,
  source: "ai",
  milestoneId: null,
  updatedAt: 0,
  updatedBy: "a@x.com",
  ...p,
});

const place = { name: "Joshua Tree", lat: 34.1, lng: -116.3, timezone: "America/Los_Angeles" };
const days = [
  { date: "2026-11-02", base: "Joshua Tree, California", title: "Arrive and settle", place },
  { date: "2026-11-03", base: "Joshua Tree, California", title: "Concert night", place },
];
const items = [
  item({ id: "a", dayDate: "2026-11-02", title: "Sunset at Keys View", start: "16:30", end: "17:30" }),
  item({ id: "b", dayDate: "2026-11-02", title: "Groceries, water; ice", order: 1 }),
  item({ id: "c", dayDate: "2026-11-03", title: "Desert concert", kind: "milestone", start: "20:00", end: null, place: "Pioneertown" }),
  item({ id: "d", dayDate: "2026-11-03", title: "Late show", start: "23:30", end: "01:00" }),
];

describe("calendar export", () => {
  it("converts a stop's local time to UTC, across daylight saving", () => {
    // Nov 2, 2026 is after the US switch back: Pacific is UTC-8.
    expect(new Date(zonedToUtc("2026-11-02", "16:30", "America/Los_Angeles")).toISOString()).toBe("2026-11-03T00:30:00.000Z");
    // Late October is still daylight time: UTC-7.
    expect(new Date(zonedToUtc("2026-10-30", "16:30", "America/Los_Angeles")).toISOString()).toBe("2026-10-30T23:30:00.000Z");
    expect(new Date(zonedToUtc("2026-07-01", "09:00", "Europe/Lisbon")).toISOString()).toBe("2026-07-01T08:00:00.000Z");
  });

  it("escapes text and folds long lines", () => {
    expect(escapeText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
    const long = `SUMMARY:${"x".repeat(200)}`;
    const folded = fold(long);
    for (const l of folded.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
    // Never splits a multi-byte character.
    expect(fold(`X:${"★".repeat(60)}`).replace(/\r\n /g, "")).toBe(`X:${"★".repeat(60)}`);
  });

  it("has an all-day event per day and a timed event per item with a start", () => {
    const ics = buildIcs({ id: "t1", title: "Desert loop" }, days, items, Date.UTC(2026, 9, 5));
    const unfolded = ics.replace(/\r\n /g, "");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(5);
    expect(unfolded).toContain("DTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261103");
    expect(unfolded).toContain("SUMMARY:Day 1: Arrive and settle (Joshua Tree\\, California)");
    expect(unfolded).toContain("DESCRIPTION:16:30 Sunset at Keys View\\nGroceries\\, water\\; ice");
    expect(unfolded).toContain("DTSTART:20261103T003000Z\r\nDTEND:20261103T013000Z");
    // No end time: an hour. Milestones get a star and their own place.
    expect(unfolded).toContain("DTSTART:20261104T040000Z\r\nDTEND:20261104T050000Z\r\nSUMMARY:★ Desert concert\r\nLOCATION:Pioneertown");
    // Past midnight ends the next day.
    expect(unfolded).toContain("DTSTART:20261104T073000Z\r\nDTEND:20261104T090000Z");
    expect(unfolded).toContain("UID:item-c-t1@sidequest");
  });

  it("uses phone time when the stop's zone isn't known", () => {
    const ics = buildIcs({ id: "t1", title: "T" }, [{ ...days[0], place: null }], [items[0]], 0);
    expect(ics).toContain("DTSTART:20261102T163000\r\nDTEND:20261102T173000");
  });

  it("names the file after the trip", () => {
    expect(icsFileName("Desert Loop: Fall '26")).toBe("desert-loop-fall-26.ics");
    expect(icsFileName("★★")).toBe("trip.ics");
  });
});

const run = (p: Partial<AiRun>): AiRun => ({ route: "ask", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, by: "a@x.com", at: 0, ...p });

describe("AI spend", () => {
  it("prices by model family", () => {
    expect(priceFor("claude-opus-5-5").output).toBe(20);
    expect(priceFor("claude-haiku-4-5-20251001").input).toBe(1);
    expect(priceFor("").input).toBe(2);
    // 20k in and 5k out on Opus: 0.08 + 0.10.
    expect(runCost(run({ model: "claude-opus-5-5", inputTokens: 20000, outputTokens: 5000 }))).toBeCloseTo(0.18);
    // Cache reads and searches count too.
    expect(runCost(run({ inputTokens: 1000, cacheReadTokens: 100000, webSearches: 3 }))).toBeCloseTo(0.002 + 0.02 + 0.03);
  });

  it("adds up this month by what and by who", () => {
    const since = Date.UTC(2026, 9, 1);
    const s = summarizeSpend(
      [
        run({ route: "options", model: "claude-opus-5-5", inputTokens: 20000, outputTokens: 5000, at: since + 1 }),
        run({ route: "ask", outputTokens: 1000, by: "b@x.com", at: since + 2 }),
        run({ route: "options", outputTokens: 100000, at: since - 1 }),
      ],
      since
    );
    expect(s.runs).toBe(2);
    expect(s.total).toBeCloseTo(0.19);
    expect(s.byWhat.map((w) => w.label)).toEqual(["Trip options", "Questions"]);
    expect(s.byWho[0]).toMatchObject({ email: "a@x.com" });
  });

  it("starts the month on the 1st and formats small amounts", () => {
    const d = new Date(monthStart(new Date(2026, 9, 17, 15).getTime()));
    expect([d.getDate(), d.getHours(), d.getMonth()]).toEqual([1, 0, 9]);
    expect(formatUsd(0.004)).toBe("under $0.01");
    expect(formatUsd(1.234)).toBe("$1.23");
    expect(formatUsd(0)).toBe("$0.00");
  });
});
