import { describe, expect, it } from "vitest";
import { dayScript, todayScript } from "@/lib/plan/readAloud";

const items = [
  { title: "Walk", start: "08:30", end: "10:00", place: null },
  { title: "Lunch", start: "12:30", end: null, place: "Taco truck" },
  { title: "Sunset viewpoint", start: "18:30", end: null, place: null },
];

describe("read aloud", () => {
  it("reads today: where, now, next, later, light, and tomorrow's move", () => {
    expect(
      todayScript({
        dayNumber: 2,
        dayCount: 5,
        title: "Exploring Joshua Tree",
        base: "Joshua Tree",
        items,
        nowMin: 9 * 60,
        sunset: "18:51",
        weather: "Clear, high 75°, low 48°",
        units: "imperial",
        move: { to: "Palm Springs", hours: "1h 10m" },
      })
    ).toBe(
      "Day 2 of 5. Exploring Joshua Tree, in Joshua Tree. Weather: Clear, high 75°, low 48°. Now: Walk, until 10 a.m.. Next: Lunch at 12:30 p.m., in 3h 30m. Later: Sunset viewpoint at 6:30 p.m.. Sunset is at 6:51 p.m.. Tomorrow you move to Palm Springs, about 1h 10m of driving."
    );
  });

  it("says so when nothing else is timed, and skips a sunset that's passed", () => {
    const s = todayScript({ dayNumber: 1, dayCount: 1, title: "Rest", base: "Moab", items: [], nowMin: 21 * 60, sunset: "18:51", weather: null, units: "metric", move: null });
    expect(s).toBe("Day 1 of 1. Rest, in Moab. Nothing else with a set time today.");
  });

  it("reads a day in order", () => {
    expect(dayScript("Rocks", "Joshua Tree", items, "imperial")).toBe(
      "Rocks, in Joshua Tree. 8:30 a.m.: Walk. 12:30 p.m.: Lunch, at Taco truck. 6:30 p.m.: Sunset viewpoint."
    );
  });
});
