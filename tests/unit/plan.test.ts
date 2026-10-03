import { describe, expect, it } from "vitest";
import { chunkDates, normalizeDays, pinMilestones, stopsByDate } from "@/lib/plan/schedule";
import { formatTime, sortItems, tooSimilar, totalNights, type TripOption } from "@/lib/model/plan";
import { addDays, dayCount, defaultInputs, missingForOptions, MilestoneSchema } from "@/lib/model/inputs";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { mockOptions } from "@/lib/ai/mocks";

const option = (stops: [string, number][]): TripOption => ({
  title: "x",
  pitch: "",
  differsBy: "",
  route: stops.map(([place, nights]) => ({ place, nights, why: "" })),
  highlights: [],
  tradeoffs: [],
  milestoneFit: "",
  estDriveHours: 0,
  pace: "balanced",
});

describe("dates", () => {
  it("counts days and adds days across months", () => {
    expect(dayCount("2026-10-30", "2026-11-02")).toBe(4);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("chunks a trip into runs of days", () => {
    expect(chunkDates("2026-10-01", "2026-10-10", 4)).toEqual([
      { from: "2026-10-01", to: "2026-10-04" },
      { from: "2026-10-05", to: "2026-10-08" },
      { from: "2026-10-09", to: "2026-10-10" },
    ]);
  });
});

describe("stopsByDate", () => {
  it("assigns each night to a stop and the last day to the last stop", () => {
    const o = option([
      ["Moab, Utah", 2],
      ["Pass-through", 0],
      ["Bryce Canyon", 1],
    ]);
    expect(stopsByDate(o, "2026-10-01", "2026-10-04")).toEqual([
      { date: "2026-10-01", stop: "Moab, Utah" },
      { date: "2026-10-02", stop: "Moab, Utah" },
      { date: "2026-10-03", stop: "Bryce Canyon" },
      { date: "2026-10-04", stop: "Bryce Canyon" },
    ]);
    expect(totalNights(o)).toBe(3);
  });

  it("pads when the model's nights fall short", () => {
    const dates = stopsByDate(option([["A", 1]]), "2026-10-01", "2026-10-04");
    expect(dates.map((d) => d.stop)).toEqual(["A", "A", "A", "A"]);
  });
});

describe("normalizeDays", () => {
  it("keeps one day per date, in order, and fills gaps", () => {
    const dates = [
      { date: "2026-10-01", stop: "A" },
      { date: "2026-10-02", stop: "B" },
    ];
    const out = normalizeDays(
      [
        { date: "2026-10-02", base: "B", title: "Two", items: [] },
        { date: "2026-10-02", base: "B", title: "Duplicate", items: [] },
        { date: "2026-09-30", base: "Z", title: "Outside", items: [] },
      ],
      dates
    );
    expect(out.map((d) => [d.date, d.title])).toEqual([
      ["2026-10-01", "Open day"],
      ["2026-10-02", "Two"],
    ]);
  });
});

describe("pinMilestones", () => {
  const wedding = MilestoneSchema.parse({
    id: "m1",
    title: "Wedding",
    kind: "wedding",
    date: "2026-10-03",
    time: "16:00",
    place: "A barn",
    priority: "required",
  });

  it("locks the AI's milestone item and links it", () => {
    const items = pinMilestones(
      {
        date: "2026-10-03",
        base: "X",
        title: "Big day",
        items: [{ kind: "activity", title: "The wedding ceremony", start: null, end: null, place: null, notes: "" }],
      },
      [wedding]
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "milestone", locked: true, milestoneId: "m1", start: "16:00" });
  });

  it("adds a locked item if the AI forgot it", () => {
    const items = pinMilestones({ date: "2026-10-03", base: "X", title: "", items: [] }, [wedding]);
    expect(items).toEqual([expect.objectContaining({ title: "Wedding", locked: true, source: "milestone", start: "16:00" })]);
  });

  it("leaves other days alone", () => {
    expect(pinMilestones({ date: "2026-10-04", base: "X", title: "", items: [] }, [wedding])).toEqual([]);
  });
});

describe("tooSimilar", () => {
  it("flags options that sleep in the same places", () => {
    const a = option([["Moab, Utah", 3], ["Bryce", 2]]);
    const b = option([["moab", 2], ["Bryce, UT", 3]]);
    const c = option([["Sedona", 3], ["Bryce", 2]]);
    expect(tooSimilar(a, b)).toBe(true);
    expect(tooSimilar(a, c)).toBe(false);
  });

  it("mock options are distinct", () => {
    const inputs = { ...defaultInputs(), regions: ["Utah", "Arizona"] };
    const opts = mockOptions({ startDate: "2026-10-01", endDate: "2026-10-08" }, inputs);
    expect(opts).toHaveLength(3);
    for (const o of opts) expect(totalNights(o)).toBeLessThanOrEqual(7);
  });
});

describe("items", () => {
  it("sorts timed items by time and keeps untimed order", () => {
    const sorted = sortItems([
      { id: "c", start: "18:00", order: 0 },
      { id: "a", start: null, order: 1 },
      { id: "b", start: "08:00", order: 2 },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("formats times for each unit system", () => {
    expect(formatTime("14:30", "imperial")).toBe("2:30pm");
    expect(formatTime("00:00", "imperial")).toBe("12am");
    expect(formatTime("9:05", "metric")).toBe("09:05");
    expect(formatTime(null, "metric")).toBe("");
  });
});

describe("trip inputs", () => {
  it("lists what's missing before options can be drafted", () => {
    expect(missingForOptions({ startDate: null, endDate: null }, defaultInputs())).toEqual([
      "start and end dates",
      "at least one region or a starting point",
      "how you're getting around",
    ]);
    expect(
      missingForOptions(
        { startDate: "2026-10-01", endDate: "2026-10-05" },
        { ...defaultInputs(), regions: ["Utah"], modes: ["campervan"] }
      )
    ).toEqual([]);
  });

  it("briefs Claude with only the answers given", () => {
    const brief = describeTrip(
      { title: "Desert loop", startDate: "2026-10-01", endDate: "2026-10-05" },
      {
        ...defaultInputs(),
        regions: ["Southern Utah"],
        modes: ["campervan"],
        vehicle: { lengthM: 6.4, heightM: 2.9, widthM: null, weightT: null, rangeKm: 600, fourWheelDrive: false, offGridNights: 3, notes: "" },
        maxDriveHoursPerDay: 4,
      },
      "2026-09-20"
    );
    expect(brief).toContain("(4 nights)");
    expect(brief).toContain("Southern Utah");
    expect(brief).toContain("length 6.4 m");
    expect(brief).toContain("3 nights off-grid");
    expect(brief).toContain("Max driving per day: 4 hours");
    expect(brief).not.toContain("Hard nos");
    expect(brief).not.toContain("—");
  });
});
