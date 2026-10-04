import { describe, expect, it } from "vitest";
import { placeKey, tempIn } from "@/lib/model/place";
import { codeLabel, parseDaily, weatherPlan, weatherFor } from "@/lib/grounding/weather";
import { holidaysFor, holidaysInRange } from "@/lib/grounding/holidays";
import { parseSummary, wikiSummary } from "@/lib/grounding/wikipedia";
import { parseHours, hoursFor } from "@/lib/grounding/places";
import { collectSources, textOf } from "@/lib/ai/research";
import { stayRange } from "@/lib/plan/schedule";

describe("placeKey", () => {
  it("makes stable, URL-safe keys", () => {
    expect(placeKey("Moab, Utah")).toBe("moab-utah");
    expect(placeKey("  São Paulo ")).toBe("sao-paulo");
    expect(placeKey("!!!")).toBe("place");
    expect(placeKey("x".repeat(200))).toHaveLength(80);
  });

  it("converts temperatures for display", () => {
    expect(tempIn(20, "metric")).toBe("20°");
    expect(tempIn(20, "imperial")).toBe("68°");
    expect(tempIn(null, "imperial")).toBe("?");
  });
});

describe("weather", () => {
  it("uses a forecast within 16 days and trims to the forecast window", () => {
    expect(weatherPlan("2026-10-05", "2026-10-30", "2026-10-03")).toEqual({ kind: "forecast", from: "2026-10-05", to: "2026-10-18" });
    expect(weatherPlan("2026-09-30", "2026-10-04", "2026-10-03")).toEqual({ kind: "forecast", from: "2026-10-03", to: "2026-10-04" });
  });

  it("uses last year's weather further out, labeled as such", () => {
    expect(weatherPlan("2026-12-20", "2026-12-24", "2026-10-03")).toEqual({ kind: "last-year", from: "2025-12-20", to: "2025-12-24" });
  });

  it("parses Open-Meteo daily data and shifts last year's dates forward", () => {
    const daily = {
      time: ["2025-12-20"],
      temperature_2m_max: [12.4],
      temperature_2m_min: [-1],
      precipitation_sum: [3.2],
      weather_code: [61],
    };
    expect(parseDaily(daily, "last-year", 1)).toEqual([
      { date: "2026-12-20", high: 12.4, low: -1, rain: 3.2, rainUnit: "mm", label: "Rain" },
    ]);
    expect(parseDaily(undefined, "forecast")).toEqual([]);
    expect(codeLabel(0)).toBe("Clear");
    expect(codeLabel(95)).toBe("Thunderstorms");
  });

  it("returns null instead of throwing without signal", async () => {
    const offline = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await weatherFor(38, -109, "2026-10-05", "2026-10-06", "2026-10-03", offline)).toBeNull();
  });
});

describe("holidays", () => {
  it("keeps only the trip's dates and names them clearly", () => {
    const list = [
      { date: "2026-10-12", localName: "Columbus Day", name: "Columbus Day" },
      { date: "2026-11-02", localName: "Día de Muertos", name: "Day of the Dead" },
      { date: "2026-11-02", localName: "Día de Muertos", name: "Day of the Dead" },
    ];
    expect(holidaysInRange(list, "2026-11-01", "2026-11-03")).toEqual([{ date: "2026-11-02", name: "Day of the Dead (Día de Muertos)" }]);
  });

  it("skips lookups without a usable country", async () => {
    expect(await holidaysFor(null, "2026-11-01", "2026-11-03")).toEqual([]);
    expect(await holidaysFor("USA", "2026-11-01", "2026-11-03")).toEqual([]);
  });
});

describe("wikipedia", () => {
  it("parses a summary and skips disambiguation pages", () => {
    expect(
      parseSummary({ type: "standard", title: "Moab, Utah", extract: "A city.", content_urls: { mobile: { page: "https://en.m.wikipedia.org/wiki/Moab,_Utah" } } })
    ).toEqual({ title: "Moab, Utah", extract: "A city.", url: "https://en.m.wikipedia.org/wiki/Moab,_Utah" });
    expect(parseSummary({ type: "disambiguation", title: "Moab", extract: "May refer to", content_urls: { mobile: { page: "x" } } })).toBeNull();
  });

  it("searches, then fetches the summary", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      return url.includes("api.php")
        ? Response.json({ query: { search: [{ title: "Moab, Utah" }] } })
        : Response.json({ type: "standard", title: "Moab, Utah", extract: "A city.", content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Moab,_Utah" } } });
    }) as unknown as typeof fetch;
    expect(await wikiSummary("Moab, Utah", fake)).toMatchObject({ title: "Moab, Utah" });
    expect(calls[1]).toContain("/page/summary/Moab%2C_Utah");
  });
});

describe("opening hours", () => {
  it("parses Google's answer", () => {
    const res = parseHours(
      {
        places: [
          {
            displayName: { text: "Taco Truck" },
            formattedAddress: "1 Main St",
            googleMapsUri: "https://maps.google.com/?cid=9",
            regularOpeningHours: { weekdayDescriptions: ["Monday: Closed"] },
          },
        ],
      },
      "taco truck",
      5
    );
    expect(res).toEqual({ available: true, name: "Taco Truck", address: "1 Main St", lines: ["Monday: Closed"], mapsUrl: "https://maps.google.com/?cid=9", checkedAt: 5 });
  });

  it("falls back to a Maps link when there are no hours or no key", async () => {
    expect(parseHours({ places: [] }, "taco truck", 5)).toEqual({ available: false, mapsUrl: expect.stringContaining("taco%20truck") });
    const saved = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    expect((await hoursFor("taco truck", null)).available).toBe(false);
    process.env.GOOGLE_PLACES_API_KEY = saved;
  });
});

describe("research output", () => {
  it("collects each cited web source once and joins the text", () => {
    const content = [
      { type: "server_tool_use" },
      {
        type: "text",
        text: "The market runs Saturdays.",
        citations: [
          { type: "web_search_result_location", url: "https://a.example/market", title: "Market", cited_text: "", encrypted_index: "" },
          { type: "web_search_result_location", url: "https://a.example/market", title: "Market", cited_text: "", encrypted_index: "" },
        ],
      },
      { type: "text", text: " Bring cash.", citations: null },
    ] as unknown as Parameters<typeof collectSources>[0];
    expect(collectSources(content)).toEqual([{ title: "Market", url: "https://a.example/market" }]);
    expect(textOf(content)).toBe("The market runs Saturdays. Bring cash.");
  });
});

describe("stayRange", () => {
  it("finds the run of days at the same base", () => {
    const days = [
      { date: "2026-10-01", base: "A" },
      { date: "2026-10-02", base: "B" },
      { date: "2026-10-03", base: "B" },
      { date: "2026-10-04", base: "C" },
    ];
    expect(stayRange(days, "2026-10-03")).toEqual({ from: "2026-10-02", to: "2026-10-03" });
    expect(stayRange(days, "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(stayRange(days, "2026-12-01")).toEqual({ from: "2026-12-01", to: "2026-12-01" });
  });
});
