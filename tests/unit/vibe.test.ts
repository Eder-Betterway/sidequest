import { describe, expect, it } from "vitest";
import { describeVibe, dialWords, effectiveVibe, NEUTRAL, readVibe, vibeChanged } from "@/lib/plan/vibe";
import { diffDay, isStale, planWrites } from "@/lib/plan/proposal";
import type { StoredItem } from "@/lib/model/plan";

describe("vibe", () => {
  it("lets a day override some dials", () => {
    expect(effectiveVibe(NEUTRAL, { pace: 10 })).toEqual({ ...NEUTRAL, pace: 10 });
    expect(effectiveVibe(NEUTRAL, { pace: undefined })).toEqual(NEUTRAL);
    expect(effectiveVibe({ ...NEUTRAL, nights: 90 }, null).nights).toBe(90);
  });

  it("notices when dials moved enough to matter", () => {
    expect(vibeChanged(NEUTRAL, { ...NEUTRAL, pace: 55 })).toBe(false);
    expect(vibeChanged(NEUTRAL, { ...NEUTRAL, pace: 30 })).toBe(true);
    expect(vibeChanged(undefined, { ...NEUTRAL, pace: 0 })).toBe(false);
  });

  it("describes dials in words", () => {
    expect(dialWords("pace", 50)).toBe("balanced");
    expect(dialWords("pace", 30)).toBe("a bit chill");
    expect(dialWords("pace", 5)).toBe("very chill");
    expect(dialWords("path", 95)).toBe("very hidden gems");
    expect(describeVibe(NEUTRAL)).toContain("pace balanced");
  });

  it("reads stored vibes defensively", () => {
    expect(readVibe(undefined)).toEqual(NEUTRAL);
    expect(readVibe({ pace: 20 })).toEqual({ ...NEUTRAL, pace: 20 });
    expect(readVibe({ pace: 500 })).toEqual(NEUTRAL);
  });
});

const item = (id: string, title: string, extra: Partial<StoredItem> = {}): StoredItem => ({
  id,
  dayDate: "2026-10-16",
  order: 0,
  kind: "activity",
  title,
  start: "09:00",
  end: null,
  place: null,
  notes: "",
  locked: false,
  source: "ai",
  milestoneId: null,
  updatedAt: 1,
  updatedBy: "me@example.com",
  ...extra,
});

describe("diffDay", () => {
  const current = [
    item("a", "Morning hike"),
    item("b", "Lunch in town", { kind: "meal", start: "12:30" }),
    item("w", "Wedding", { kind: "milestone", locked: true, start: "16:00" }),
  ];

  it("turns a suggested day into adds, changes, and drops", () => {
    const ops = diffDay(current, [
      { kind: "meal", title: "Lunch in town", start: "13:00", end: null, place: null, notes: "" },
      { kind: "free", title: "Nap", start: "14:00", end: null, place: null, notes: "" },
    ]);
    expect(ops.map((o) => o.op).sort()).toEqual(["add", "remove", "update"]);
    expect(ops.find((o) => o.op === "remove")).toMatchObject({ itemId: "a" });
    expect(ops.find((o) => o.op === "update")).toMatchObject({ itemId: "b", after: { start: "13:00" } });
  });

  it("never proposes touching locked items, even if the AI echoes them", () => {
    const ops = diffDay(current, [
      { kind: "milestone", title: "Wedding", start: "18:00", end: null, place: null, notes: "" },
      { kind: "activity", title: "Morning hike", start: "09:00", end: null, place: null, notes: "" },
      { kind: "meal", title: "Lunch in town", start: "12:30", end: null, place: null, notes: "" },
    ]);
    expect(ops).toEqual([]);
  });
});

describe("planWrites", () => {
  const items = [item("a", "Hike", { order: 2 }), item("w", "Wedding", { locked: true, order: 3 })];

  it("applies only the changes you kept, adding after the last item", () => {
    const writes = planWrites(
      [
        { op: "add", key: "a0", item: { kind: "free", title: "Nap", start: null, end: null, place: null, notes: "" } },
        { op: "remove", key: "r0", itemId: "a", title: "Hike" },
      ],
      new Set(["a0"]),
      items
    );
    expect(writes).toEqual([{ type: "add", item: expect.objectContaining({ title: "Nap" }), order: 4 }]);
  });

  it("refuses to change or remove a locked item", () => {
    const writes = planWrites(
      [
        { op: "remove", key: "r0", itemId: "w", title: "Wedding" },
        {
          op: "update",
          key: "u0",
          itemId: "w",
          before: { kind: "milestone", title: "Wedding", start: "16:00", end: null, place: null, notes: "" },
          after: { kind: "milestone", title: "Wedding", start: "20:00", end: null, place: null, notes: "" },
        },
        { op: "remove", key: "r1", itemId: "gone", title: "Deleted already" },
      ],
      new Set(["r0", "u0", "r1"]),
      items
    );
    expect(writes).toEqual([]);
  });
});

describe("isStale", () => {
  it("flags suggestions whose items changed or disappeared", () => {
    const basedOn = { a: 1, b: 1 };
    expect(isStale({ basedOn }, [{ id: "a", updatedAt: 1 }, { id: "b", updatedAt: 1 }])).toBe(false);
    expect(isStale({ basedOn }, [{ id: "a", updatedAt: 2 }, { id: "b", updatedAt: 1 }])).toBe(true);
    expect(isStale({ basedOn }, [{ id: "a", updatedAt: 1 }])).toBe(true);
  });
});
