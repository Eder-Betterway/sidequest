import { describe, expect, it } from "vitest";
import { ago, canUndo, changesSince, clean, undoConflicts, who } from "@/lib/model/history";
import { daysBetween, nowAndNext, tripPhase, untilText } from "@/lib/plan/today";

const at = (h: number, m = 0) => h * 60 + m;
const items = [
  { title: "Walk", start: "08:30", end: "10:00" },
  { title: "Lunch", start: "12:30", end: "13:30" },
  { title: "Open afternoon", start: null, end: null },
  { title: "Sunset", start: "18:30", end: null },
];

describe("today", () => {
  it("knows where the trip is relative to today", () => {
    const trip = { startDate: "2026-11-02", endDate: "2026-11-04" };
    expect(tripPhase(trip, "2026-11-01")).toBe("before");
    expect(tripPhase(trip, "2026-11-02")).toBe("during");
    expect(tripPhase(trip, "2026-11-04")).toBe("during");
    expect(tripPhase(trip, "2026-11-05")).toBe("after");
    expect(tripPhase({ startDate: null, endDate: null }, "2026-11-05")).toBe("undated");
    expect(daysBetween("2026-10-04", "2026-11-02")).toBe(29);
  });

  it("finds what's on now and next", () => {
    expect(nowAndNext(items, at(9)).current?.title).toBe("Walk");
    expect(nowAndNext(items, at(9)).next?.title).toBe("Lunch");
    const late = nowAndNext(items, at(11));
    expect(late.current).toBeNull();
    expect(late.next?.title).toBe("Lunch");
    expect(late.later.map((i) => i.title)).toEqual(["Sunset"]);
    expect(late.anytime.map((i) => i.title)).toEqual(["Open afternoon"]);
    // No end time: counts as an hour.
    expect(nowAndNext(items, at(19)).current?.title).toBe("Sunset");
    expect(nowAndNext(items, at(20)).current).toBeNull();
    expect(untilText(45)).toBe("in 45 min");
    expect(untilText(130)).toBe("in 2h 10m");
    expect(untilText(120)).toBe("in 2h");
  });
});

describe("change history", () => {
  it("drops undefined and local-only fields before saving", () => {
    expect(clean({ a: 1, b: undefined, pending: true, c: null })).toEqual({ a: 1, c: null });
  });

  it("can undo a change once, if it saved what it changed", () => {
    expect(canUndo({ undo: { addedIds: [], items: [], days: [] }, undoneAt: null })).toBe(true);
    expect(canUndo({ undo: { addedIds: [], items: [], days: [] }, undoneAt: 5 })).toBe(false);
    expect(canUndo({ undo: null })).toBe(false);
  });

  it("warns before undo overwrites later edits", () => {
    const entry = {
      at: 1000,
      undo: { addedIds: ["new"], items: [{ id: "old" } as never], days: [{ id: "2026-11-03", date: "2026-11-03" } as never] },
    };
    expect(undoConflicts(entry, [{ id: "new", title: "Pool", updatedAt: 1000 }], [{ date: "2026-11-03", updatedAt: 1000 }])).toEqual([]);
    expect(
      undoConflicts(entry, [{ id: "old", title: "Hike", updatedAt: 9000 }, { id: "x", title: "Other", updatedAt: 9000 }], [{ date: "2026-11-03", updatedAt: 9000 }])
    ).toEqual(["Hike", "the plan for 2026-11-03"]);
  });

  it("lists what the other person changed since you looked, newest first", () => {
    const feed = changesSince(
      100,
      "Me@example.com",
      [
        { by: "jes@example.com", at: 200, label: "Applied 2 changes to 2026-11-03" },
        { by: "me@example.com", at: 300, label: "Mine" },
        { by: "jes@example.com", at: 50, label: "Too old" },
      ],
      [
        { title: "Pool", updatedAt: 201, updatedBy: "jes@example.com", dayDate: "2026-11-03" },
        { title: "Hike", updatedAt: 20_000, updatedBy: "jes@example.com", dayDate: "2026-11-04" },
        { title: "Mine", updatedAt: 40_000, updatedBy: "me@example.com", dayDate: "2026-11-04" },
      ],
      [
        { kind: "tip", text: "Hot springs at dawn", createdBy: "jes@example.com", createdAt: 30_000 },
        { kind: "flyer", text: "", createdBy: "jes@example.com", createdAt: 31_000 },
      ]
    );
    expect(feed.map((f) => f.text)).toEqual([
      "Snapped a flyer",
      'Added a tip: "Hot springs at dawn"',
      'Edited "Hike" on 2026-11-04',
      "Applied 2 changes to 2026-11-03",
    ]);
  });

  it("says who and when, plainly", () => {
    expect(who("me@example.com", " ME@example.com")).toBe("You");
    expect(who("jes@example.com", "me@example.com")).toBe("jes");
    expect(ago(0, 30_000)).toBe("just now");
    expect(ago(0, 12 * 60_000)).toBe("12 min ago");
    expect(ago(0, 3 * 3_600_000)).toBe("3 h ago");
    expect(ago(0, 49 * 3_600_000)).toBe("2 days ago");
  });
});
