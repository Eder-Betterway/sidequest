import { describe, expect, it } from "vitest";
import { moonLabel, sunTimes, timeIn } from "@/lib/grounding/sun";
import { geocode, pickResult } from "@/lib/grounding/geocode";

describe("sun times", () => {
  it("are shown in the destination's time zone", () => {
    // Moab, Utah on 2026-10-14: sunrise about 7:30am, sunset about 6:40pm MDT.
    const t = sunTimes("2026-10-14", 38.573, -109.549, "America/Denver");
    const toMin = (s: string | null) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : NaN);
    expect(toMin(t.sunrise)).toBeGreaterThan(7 * 60 + 15);
    expect(toMin(t.sunrise)).toBeLessThan(7 * 60 + 45);
    expect(toMin(t.sunset)).toBeGreaterThan(18 * 60 + 25);
    expect(toMin(t.sunset)).toBeLessThan(18 * 60 + 55);
    expect(toMin(t.goldenEvening)).toBeLessThan(toMin(t.sunset));
    expect(toMin(t.dusk)).toBeGreaterThan(toMin(t.sunset));
  });

  it("picks the right calendar day on the far side of the date line", () => {
    // Auckland: sunrise must be in the local morning, not the previous evening.
    const t = sunTimes("2026-12-01", -36.85, 174.76, "Pacific/Auckland");
    expect(Number(t.sunrise!.slice(0, 2))).toBeLessThan(8);
    expect(Number(t.sunset!.slice(0, 2))).toBeGreaterThanOrEqual(19);
  });

  it("handles polar days with no sunset", () => {
    expect(timeIn(new Date(NaN), "UTC")).toBeNull();
    const t = sunTimes("2026-06-21", 78.22, 15.65, "Arctic/Longyearbyen");
    expect(t.sunset).toBeNull();
  });

  it("names moon phases", () => {
    expect(moonLabel(0.01)).toBe("New moon (dark skies)");
    expect(moonLabel(0.5)).toBe("Full moon");
  });
});

describe("geocoding", () => {
  const results = [
    { name: "Moab", latitude: 1, longitude: 1, timezone: "Asia/Kolkata", country: "India", admin1: "Somewhere" },
    { name: "Moab", latitude: 38.57, longitude: -109.55, timezone: "America/Denver", country: "United States", admin1: "Utah" },
  ];

  it("prefers the result matching the region hint", () => {
    expect(pickResult("Moab, Utah", results)?.timezone).toBe("America/Denver");
    expect(pickResult("Moab", results)?.timezone).toBe("Asia/Kolkata");
    expect(pickResult("Nowhere", [])).toBeNull();
  });

  it("returns null instead of throwing when the lookup fails", async () => {
    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await geocode("Moab, Utah", failing)).toBeNull();
  });

  it("parses a successful lookup", async () => {
    const ok = (async () => Response.json({ results })) as unknown as typeof fetch;
    expect(await geocode("Moab, Utah", ok)).toEqual({ name: "Moab, Utah", lat: 38.57, lng: -109.55, timezone: "America/Denver" });
  });
});
