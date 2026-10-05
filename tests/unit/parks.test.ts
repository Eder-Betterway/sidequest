import { describe, expect, it } from "vitest";
import { nearestPark, parksNear, parseAlerts, parseCampgrounds, recGovSearchUrl, searchTerm } from "@/lib/grounding/parks";

const JT = { lat: 34.13, lng: -116.31 };
const jotr = { fullName: "Joshua Tree National Park", parkCode: "jotr", url: "https://www.nps.gov/jotr/index.htm", latitude: "33.91418525", longitude: "-115.8398125" };

describe("parks", () => {
  it("searches by the place's short name", () => {
    expect(searchTerm("Joshua Tree, California")).toBe("Joshua Tree");
    expect(searchTerm("Zion National Park, Utah")).toBe("Zion");
    expect(recGovSearchUrl("Joshua Tree, California")).toBe("https://www.recreation.gov/search?q=Joshua+Tree");
  });

  it("picks the nearest park within reach, skipping ones far away or without coordinates", () => {
    const far = { ...jotr, fullName: "Far Park", parkCode: "farp", latitude: "40", longitude: "-110" };
    const blank = { ...jotr, fullName: "No coords", parkCode: "none", latitude: "", longitude: "" };
    expect(nearestPark([far, blank, jotr], JT)).toMatchObject({ code: "jotr", km: 50 });
    expect(nearestPark([far], JT)).toBeNull();
  });

  it("puts closures and dangers first and strips HTML", () => {
    const alerts = parseAlerts([
      { title: "Nice wildflowers", category: "Information", description: "<p>Blooming now</p>" },
      { title: "Road closed", category: "Park Closure", description: "Keys View Road  closed", url: "https://www.nps.gov/jotr/x.htm" },
      { title: "Flash floods", category: "Danger", description: "", url: "http://insecure" },
    ]);
    expect(alerts.map((a) => a.category)).toEqual(["Park Closure", "Danger", "Information"]);
    expect(alerts[2].description).toBe("Blooming now");
    expect(alerts[0].description).toBe("Keys View Road closed");
    expect(alerts[1].url).toBeNull();
  });

  it("keeps reservable campgrounds nearby, nearest first, with booking links", () => {
    const camps = parseCampgrounds(
      [
        { FacilityID: "272299", FacilityName: "JUMBO ROCKS CAMPGROUND", FacilityTypeDescription: "Campground", Reservable: true, FacilityLatitude: 33.99, FacilityLongitude: -116.06 },
        { FacilityID: "1", FacilityName: "Black Rock Campground", FacilityTypeDescription: "Campground", Reservable: true, FacilityLatitude: 34.07, FacilityLongitude: -116.39 },
        { FacilityID: "2", FacilityName: "Walk-up only", FacilityTypeDescription: "Campground", Reservable: false, FacilityLatitude: 34.1, FacilityLongitude: -116.3 },
        { FacilityID: "3", FacilityName: "Visitor Center", FacilityTypeDescription: "Facility", Reservable: true, FacilityLatitude: 34.1, FacilityLongitude: -116.3 },
      ],
      JT
    );
    expect(camps.map((c) => c.name)).toEqual(["Black Rock Campground", "Jumbo Rocks Campground"]);
    expect(camps[1].url).toBe("https://www.recreation.gov/camping/campgrounds/272299");
  });

  it("looks up both with keys, skips without, and only in the US", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers as Record<string, string> });
      const body = url.includes("/parks?")
        ? { data: [jotr] }
        : url.includes("/alerts?")
          ? { data: [{ title: "Road closed", category: "Park Closure", description: "x" }] }
          : { RECDATA: [{ FacilityID: "1", FacilityName: "Black Rock Campground", FacilityTypeDescription: "Campground", Reservable: true, FacilityLatitude: 34.07, FacilityLongitude: -116.39 }] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const place = { name: "Joshua Tree, California", ...JT, countryCode: "US" };

    const both = await parksNear(place, { nps: "k1", ridb: "k2" }, fake);
    expect(both?.park?.alerts[0].title).toBe("Road closed");
    expect(both?.campgrounds).toHaveLength(1);
    expect(calls.find((c) => c.url.includes("/parks?"))?.url).toContain("q=Joshua%20Tree");
    expect(calls.find((c) => c.url.includes("/parks?"))?.headers["X-Api-Key"]).toBe("k1");
    expect(calls.find((c) => c.url.includes("ridb"))?.headers.apikey).toBe("k2");
    expect(calls.find((c) => c.url.includes("ridb"))?.url).toContain("radius=25&activity=9");

    calls.length = 0;
    expect(await parksNear(place, {}, fake)).toEqual({ park: null, campgrounds: [], checked: { nps: false, ridb: false } });
    expect(calls).toHaveLength(0);
    expect(await parksNear({ ...place, countryCode: "CA" }, { nps: "k1", ridb: "k2" }, fake)).toBeNull();

    const down = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    expect(await parksNear(place, { nps: "k1", ridb: "k2" }, down)).toEqual({ park: null, campgrounds: [], checked: { nps: true, ridb: true } });
  });
});
