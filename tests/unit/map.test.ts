import { describe, expect, it } from "vitest";
import { MAX_WAYPOINTS, placeUrl, project, routeStops, routeUrl } from "@/lib/plan/map";

const place = (name: string, lat: number, lng: number) => ({ name, lat, lng, timezone: "America/Los_Angeles" });
const pal = place("Palm Springs", 33.83, -116.55);
const jt = place("Joshua Tree", 34.13, -116.31);
const days = [
  { date: "2026-11-02", base: "Palm Springs, California", place: pal },
  { date: "2026-11-03", base: "Joshua Tree, California", place: jt },
  { date: "2026-11-04", base: "Joshua Tree, California", place: jt },
  { date: "2026-11-05", base: "Somewhere unknown", place: null },
  { date: "2026-11-06", base: "Palm Springs, California", place: pal },
];

describe("route map", () => {
  it("lists stays in order, counting days, keeping a return visit, skipping unknown places", () => {
    const stops = routeStops(days);
    expect(stops.map((s) => [s.n, s.name, s.from, s.to, s.days])).toEqual([
      [1, "Palm Springs, California", "2026-11-02", "2026-11-02", 1],
      [2, "Joshua Tree, California", "2026-11-03", "2026-11-04", 2],
      [3, "Palm Springs, California", "2026-11-06", "2026-11-06", 1],
    ]);
  });

  it("fits the stops in the box, keeping north up and east right", () => {
    const pts = project([pal, jt], 320, 200, 20);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(20);
      expect(p.x).toBeLessThanOrEqual(300);
      expect(p.y).toBeGreaterThanOrEqual(20);
      expect(p.y).toBeLessThanOrEqual(180);
    }
    // Joshua Tree is north-east of Palm Springs.
    expect(pts[1].x).toBeGreaterThan(pts[0].x);
    expect(pts[1].y).toBeLessThan(pts[0].y);
    // One stop sits in the middle.
    expect(project([pal], 320, 200, 20)).toEqual([{ x: 160, y: 100 }]);
    expect(project([], 320, 200, 20)).toEqual([]);
  });

  it("links directions through every stop", () => {
    const url = new URL(routeUrl(routeStops(days))!);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("origin")).toBe("33.83000,-116.55000");
    expect(url.searchParams.get("destination")).toBe("33.83000,-116.55000");
    expect(url.searchParams.get("waypoints")).toBe("34.13000,-116.31000");
    expect(routeUrl([pal])).toBeNull();
    // Too many stops: thinned to what Google allows.
    const many = Array.from({ length: 30 }, (_, i) => ({ lat: 30 + i / 10, lng: -110 }));
    expect(new URL(routeUrl(many)!).searchParams.get("waypoints")!.split("|")).toHaveLength(MAX_WAYPOINTS);
    expect(placeUrl(jt)).toBe("https://www.google.com/maps/search/?api=1&query=34.13000%2C-116.31000");
  });
});
