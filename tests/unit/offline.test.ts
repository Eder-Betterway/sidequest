import { describe, expect, it } from "vitest";
import { offlineTasks, stopsOf, taskLabel, type Saved } from "@/lib/plan/offline";

const place = (name: string, lat: number) => ({ name, lat, lng: -116, timezone: "America/Los_Angeles", countryCode: "US" });
const days = [
  { date: "2026-11-02", base: "Joshua Tree", place: place("Joshua Tree", 34.1) },
  { date: "2026-11-03", base: "Joshua Tree", place: place("Joshua Tree", 34.1) },
  { date: "2026-11-04", base: "Palm Springs", place: place("Palm Springs", 33.8) },
  { date: "2026-11-05", base: "Nowhere", place: null },
  { date: "2026-11-06", base: "Joshua Tree", place: place("Joshua Tree", 34.1) },
];
const none = (): Saved => ({ places: new Map(), spots: new Set(), legs: new Set() });

describe("get ready for no signal", () => {
  it("finds each stay with a location, once per place", () => {
    expect(stopsOf(days).map((s) => [s.key, s.from, s.to])).toEqual([
      ["joshua-tree", "2026-11-02", "2026-11-03"],
      ["palm-springs", "2026-11-04", "2026-11-04"],
    ]);
  });

  it("lists details, spots, and drives still to save", () => {
    const tasks = offlineTasks(days, { spots: true, drives: true, writeUps: true }, none());
    expect(tasks.map((t) => t.id)).toEqual([
      "place:joshua-tree",
      "place:palm-springs",
      "spots:joshua-tree",
      "spots:palm-springs",
      "drive:leg-joshua-tree--palm-springs",
    ]);
    expect(taskLabel(tasks[0])).toBe("Joshua Tree: details, weather, holidays");
    expect(taskLabel(tasks[4])).toBe("Drive: Joshua Tree to Palm Springs");
    expect(offlineTasks(days, { spots: false, drives: false, writeUps: true }, none())).toHaveLength(2);
  });

  it("skips what's already saved for these dates", () => {
    const saved: Saved = {
      places: new Map([
        ["joshua-tree", { from: "2026-11-02", to: "2026-11-03", hasWriteUp: true }],
        // Saved for other dates: look it up again.
        ["palm-springs", { from: "2026-12-01", to: "2026-12-02", hasWriteUp: true }],
      ]),
      spots: new Set(["near-joshua-tree", "near-palm-springs"]),
      legs: new Set(["leg-joshua-tree--palm-springs"]),
    };
    expect(offlineTasks(days, { spots: true, drives: true, writeUps: true }, saved).map((t) => t.id)).toEqual(["place:palm-springs"]);
  });

  it("only re-fetches for a write-up when write-ups are wanted", () => {
    const saved: Saved = { ...none(), places: new Map([["joshua-tree", { from: "2026-11-02", to: "2026-11-03", hasWriteUp: false }]]) };
    const ids = (writeUps: boolean) => offlineTasks(days.slice(0, 2), { spots: false, drives: false, writeUps }, saved).map((t) => t.id);
    expect(ids(true)).toEqual(["place:joshua-tree"]);
    expect(ids(false)).toEqual([]);
  });
});
