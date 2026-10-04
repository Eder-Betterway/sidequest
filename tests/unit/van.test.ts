import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as leg } from "@/app/api/van/leg/route";
import { POST as nearby } from "@/app/api/van/nearby/route";
import { driveBetween, orsBody } from "@/lib/grounding/route";
import { overpassQuery } from "@/lib/grounding/overpass";
import { defaultInputs, VehicleSchema } from "@/lib/model/inputs";
import {
  estimateLeg,
  formatDistance,
  formatHours,
  formatLength,
  haversineKm,
  legFlags,
  legKey,
  legsFor,
  parseLength,
  parseOverpass,
  recreationGovUrl,
  routeProfile,
  tooLong,
} from "@/lib/model/van";

const MOAB = { lat: 38.5733, lng: -109.5498 };
const PAGE = { lat: 36.9147, lng: -111.4558 };
const van = (patch: object = {}) => VehicleSchema.parse({ lengthM: 6, heightM: 2.6, ...patch });

describe("drive legs", () => {
  it("measures straight-line distance and pads it for roads", () => {
    expect(Math.round(haversineKm(MOAB, PAGE))).toBe(249);
    expect(estimateLeg(MOAB, PAGE)).toEqual({ km: 324, hours: 4.6 });
  });

  it("routes big rigs as trucks and everyday vans as cars", () => {
    expect(routeProfile(null)).toBe("driving-car");
    expect(routeProfile(van())).toBe("driving-car");
    expect(routeProfile(van({ weightT: 5 }))).toBe("driving-hgv");
    expect(routeProfile(van({ heightM: 3.5 }))).toBe("driving-hgv");
    expect(routeProfile(van({ lengthM: 9 }))).toBe("driving-hgv");
  });

  it("sends the van's limits to the truck router only for big rigs", () => {
    expect(orsBody(MOAB, PAGE, van())).toEqual({ coordinates: [[MOAB.lng, MOAB.lat], [PAGE.lng, PAGE.lat]] });
    expect(orsBody(MOAB, PAGE, van({ weightT: 5 })).options).toEqual({
      vehicle_type: "hgv",
      profile_params: { restrictions: { height: 2.6, length: 6, weight: 5 } },
    });
  });

  it("finds a leg each time the base changes", () => {
    const p = (name: string, lat: number) => ({ name, lat, lng: -110 });
    const days = [
      { date: "2026-11-02", base: "Moab", place: p("Moab", 38) },
      { date: "2026-11-03", base: "Moab", place: p("Moab", 38) },
      { date: "2026-11-04", base: "Page", place: p("Page", 36) },
      { date: "2026-11-05", base: "Nowhere", place: null },
    ];
    expect(legsFor(days)).toEqual([{ date: "2026-11-04", from: p("Moab", 38), to: p("Page", 36) }]);
    expect(legKey("Moab, Utah", "Page, AZ")).toBe("leg-moab-utah--page-az");
  });

  it("flags drives against the trip's own limits", () => {
    const base = { ...defaultInputs(), maxDriveHoursPerDay: null, noNightDriving: false, vehicle: null };
    expect(legFlags({ km: 300, hours: 4 }, base)).toEqual([]);
    expect(legFlags({ km: 600, hours: 7.5 }, base).map((f) => f.text)).toEqual(["A long drive day."]);
    expect(legFlags({ km: 300, hours: 4.5 }, { ...base, maxDriveHoursPerDay: 4 })[0].text).toBe("Over your 4h a day. Split it or start early.");
    expect(legFlags({ km: 500, hours: 5 }, { ...base, vehicle: van({ rangeKm: 450 }) })[0].text).toBe("Longer than one tank. Refuel on the way.");
    expect(legFlags({ km: 400, hours: 5 }, { ...base, vehicle: van({ rangeKm: 450 }) })[0]).toEqual({ level: "info", text: "Uses most of a tank. Fill up before you go." });
    expect(legFlags({ km: 700, hours: 8 }, { ...base, maxDriveHoursPerDay: 9, noNightDriving: true }).map((f) => f.text)).toEqual([
      "Hard to finish before dark with stops. Leave early.",
    ]);
  });

  it("falls back to an estimate without a routing key", async () => {
    delete process.env.ORS_API_KEY;
    expect(await driveBetween(MOAB, PAGE, null)).toEqual({ km: 324, hours: 4.6, source: "estimate", profile: "driving-car-estimate" });
  });
});

describe("spots from OpenStreetMap", () => {
  it("reads length limits in meters or feet", () => {
    expect(parseLength("9")).toBe(9);
    expect(parseLength("9 m")).toBe(9);
    expect(parseLength("30'")).toBe(9.1);
    expect(parseLength("30 ft")).toBe(9.1);
    expect(parseLength("long")).toBeNull();
    expect(parseLength(undefined)).toBeNull();
  });

  it("keeps van-friendly spots, nearest first, with the facts that matter", () => {
    const spots = parseOverpass(
      {
        elements: [
          { type: "way", id: 1, center: { lat: 38.6, lon: -109.55 }, tags: { tourism: "camp_site", name: "Far camp", fee: "yes", maxlength: "25'", shower: "hot", website: "https://example.com" } },
          { type: "node", id: 2, lat: 38.58, lon: -109.55, tags: { tourism: "caravan_site", fee: "no", sanitary_dump_station: "yes" } },
          { type: "node", id: 3, lat: 38.574, lon: -109.55, tags: { tourism: "camp_site", name: "Tents only", caravans: "no" } },
          { type: "node", id: 4, lat: 38.575, lon: -109.55, tags: { amenity: "sanitary_dump_station", water_point: "yes" } },
          { type: "node", id: 5, lat: 38.59, lon: -109.55, tags: { amenity: "water_point", name: "Town fill" } },
          { type: "node", id: 6, tags: { tourism: "camp_site" } },
          { type: "node", id: 7, lat: 38.59, lon: -109.55, tags: { amenity: "cafe" } },
        ],
      },
      MOAB
    );
    expect(spots.map((s) => [s.id, s.kind, s.name])).toEqual([
      ["node/4", "dump", "Dump station"],
      ["node/2", "camp", "Campsite"],
      ["node/5", "water", "Town fill"],
      ["way/1", "camp", "Far camp"],
    ]);
    expect(spots[0].facts).toEqual(["Water too"]);
    expect(spots[1]).toMatchObject({ fee: false, facts: ["RV park", "Dump too"] });
    expect(spots[3]).toMatchObject({ fee: true, maxLengthM: 7.6, url: "https://example.com", facts: ["Showers"] });
  });

  it("warns only when a posted limit is shorter than the van", () => {
    expect(tooLong({ maxLengthM: 7 }, van({ lengthM: 7.6 }))).toBe(true);
    expect(tooLong({ maxLengthM: 9 }, van({ lengthM: 7.6 }))).toBe(false);
    expect(tooLong({ maxLengthM: null }, van({ lengthM: 7.6 }))).toBe(false);
    expect(tooLong({ maxLengthM: 7 }, null)).toBe(false);
  });

  it("asks Overpass for camps close by and services a bit further", () => {
    const q = overpassQuery(MOAB);
    expect(q).toContain('nwr(around:30000,38.57330,-109.54980)["tourism"~"^(camp_site|caravan_site)$"]');
    expect(q).toContain('nwr(around:50000,38.57330,-109.54980)["amenity"="sanitary_dump_station"]');
  });
});

describe("formatting", () => {
  it("reads naturally in both unit systems", () => {
    expect(formatHours(4.5)).toBe("4h 30m");
    expect(formatHours(3)).toBe("3h");
    expect(formatHours(0.4)).toBe("24m");
    expect(formatDistance(412, "imperial")).toBe("256 mi");
    expect(formatDistance(5.6, "imperial")).toBe("3.5 mi");
    expect(formatDistance(412, "metric")).toBe("412 km");
    expect(formatLength(7, "imperial")).toBe("23 ft");
    expect(formatLength(7, "metric")).toBe("7 m");
    expect(recreationGovUrl("Moab, Utah")).toBe("https://www.recreation.gov/search?q=Moab%2C%20Utah&entity_type=campground");
  });
});

// ---------- Routes ----------

const env = { ...process.env };
beforeAll(() => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-routes";
  process.env.ALLOWED_EMAILS = "me@example.com";
  process.env.AI_MOCK = "1";
});
afterAll(() => {
  process.env = env;
});

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (email: string) => `${b64({ alg: "none", typ: "JWT" })}.${b64({ aud: "demo-routes", sub: "u1", email })}.`;
const post = (body: unknown, email: string | null = "me@example.com") =>
  new Request("http://localhost/api/van", {
    method: "POST",
    headers: { "content-type": "application/json", ...(email ? { authorization: `Bearer ${token(email)}` } : {}) },
    body: JSON.stringify(body),
  });

describe("van routes", () => {
  const from = { name: "Moab", ...MOAB };
  const to = { name: "Page", ...PAGE };

  it("only members can use them, with valid places", async () => {
    expect((await leg(post({ from, to }, null))).status).toBe(401);
    expect((await nearby(post({ place: from }, "stranger@example.com"))).status).toBe(403);
    expect((await leg(post({ from, to: { ...to, lat: 200 } }))).status).toBe(400);
  });

  it("return a leg and nearby spots", async () => {
    expect(await (await leg(post({ from, to, vehicle: van() }))).json()).toMatchObject({ km: 412, hours: 5.5, source: "route" });
    const spots = (await (await nearby(post({ place: from }))).json()).spots;
    expect(spots.map((s: { kind: string }) => s.kind)).toEqual(["camp", "camp", "dump"]);
  });
});
