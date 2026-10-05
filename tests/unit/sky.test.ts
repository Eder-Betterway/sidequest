import { describe, expect, it } from "vitest";
import { parsePopulation, parseTowns, townsQuery } from "@/lib/grounding/glow";
import { coreAltitude, glowFrom, glowLabel, hoursText, nightSky, rateNight } from "@/lib/grounding/sky";
import { parseNightClouds } from "@/lib/grounding/weather";

const JT = { lat: 34.13, lng: -116.31, tz: "America/Los_Angeles" };

describe("night sky", () => {
  it("finds the real dark window and the Milky Way in summer", () => {
    // Mid-June, new moon: astronomical dark is about 9:45pm to 3:45am in the desert.
    const n = nightSky("2026-06-15", JT.lat, JT.lng, JT.tz);
    expect(n.astroDarkMin).toBeGreaterThan(300);
    expect(n.astroDarkMin).toBeLessThan(400);
    expect(n.bestFrom).toMatch(/^2[12]:/);
    expect(n.bestTo).toMatch(/^0[34]:/);
    expect(n.moonLit).toBeLessThan(0.05);
    expect(n.milkyWay).not.toBeNull();
  });

  it("knows a full moon spoils the night and the core is a summer thing", () => {
    const full = nightSky("2026-07-28", JT.lat, JT.lng, JT.tz);
    expect(full.moonLit).toBeGreaterThan(0.9);
    expect(full.moonlessMin).toBe(0);
    expect(full.milkyWay).toBeNull();
    expect(nightSky("2026-12-15", JT.lat, JT.lng, JT.tz).milkyWay).toBeNull();
  });

  it("never gets dark in an Arctic summer", () => {
    const n = nightSky("2026-06-21", 69.65, 18.96, "Europe/Oslo");
    expect(n.astroDarkMin).toBe(0);
    expect(n.bestFrom).toBeNull();
  });

  it("puts the galactic core no higher than 90 minus latitude minus 29", () => {
    let max = -90;
    for (let m = 0; m < 1440; m += 5) max = Math.max(max, coreAltitude(new Date(Date.parse("2026-07-14T00:00:00Z") + m * 60000), JT.lat, JT.lng));
    expect(max).toBeCloseTo(90 - 34.13 - 29.0, 0);
  });
});

describe("town glow", () => {
  it("adds up towns by Walker's law, nearest and biggest first", () => {
    const g = glowFrom([
      { name: "Far city", population: 4_000_000, km: 200 },
      { name: "Near town", population: 26_000, km: 20 },
      { name: "Nobody", population: 0, km: 2 },
    ]);
    // 4e6 / 200^2.5 = 7.07; 26000 / 20^2.5 = 14.53
    expect(g.index).toBeCloseTo(21.6, 1);
    expect(g.sources.map((s) => s.name)).toEqual(["Near town", "Far city"]);
    expect(g.label).toMatch(/^Fairly dark/);
    expect(glowFrom([]).label).toMatch(/^Very dark/);
    expect(glowLabel(10000)).toMatch(/^City sky/);
  });

  it("reads OpenStreetMap populations however they're written", () => {
    expect(parsePopulation("12,345")).toBe(12345);
    expect(parsePopulation("12 345")).toBe(12345);
    expect(parsePopulation("12345 (2020)")).toBe(12345);
    expect(parsePopulation(undefined)).toBe(0);
    const towns = parseTowns(
      {
        elements: [
          { id: 1, lat: 34.13, lon: -116.05, tags: { name: "Twentynine Palms", population: "26,073" } },
          { id: 1, lat: 34.13, lon: -116.05, tags: { name: "Twentynine Palms", population: "26,073" } },
          { id: 2, lat: 34.0, lon: -116.0, tags: { name: "No count" } },
        ],
      },
      { lat: 34.13, lng: -116.31 }
    );
    expect(towns).toHaveLength(1);
    expect(towns[0].km).toBeGreaterThan(20);
    expect(townsQuery({ lat: 34.13, lng: -116.31 })).toContain('(around:80000,34.13000,-116.31000)["place"~"^(city|town)$"]');
  });
});

describe("night clouds and the rating", () => {
  it("averages 9pm to 3am into the evening it belongs to", () => {
    const time = ["2026-11-03T20:00", "2026-11-03T21:00", "2026-11-03T22:00", "2026-11-03T23:00", "2026-11-04T00:00", "2026-11-04T01:00", "2026-11-04T02:00", "2026-11-04T03:00", "2026-11-04T04:00"];
    const cloud_cover = [100, 10, 20, 30, 40, 50, 60, 70, 100];
    expect(parseNightClouds({ time, cloud_cover })).toEqual([{ date: "2026-11-03", cloud: 40 }]);
    expect(parseNightClouds(undefined)).toEqual([]);
  });

  it("rates a night from dark time, glow, and clouds", () => {
    expect(rateNight({ moonlessMin: 360 }, 5, 1)).toBe("Great");
    expect(rateNight({ moonlessMin: 360 }, null, 40)).toBe("Good");
    expect(rateNight({ moonlessMin: 60 }, null, 300)).toBe("Poor");
    expect(rateNight({ moonlessMin: 360 }, 85, 1)).toBe("Poor");
    expect(hoursText(275)).toBe("4h 35m");
    expect(hoursText(0)).toBe("none");
  });
});
