import type { Place } from "@/lib/model/plan";

/**
 * The trip's route as a sketch: each stay in order (a place you come back to
 * shows up again), placed by its coordinates. No map tiles, so it works with
 * no signal; "Open in Google Maps" hands off for the real roads.
 */

export interface RouteStop {
  n: number;
  name: string;
  lat: number;
  lng: number;
  from: string;
  to: string;
  /** Nights here: the days at this stop, less the last if the trip moves on. */
  days: number;
}

export function routeStops(days: { date: string; base: string; place: Place | null }[]): RouteStop[] {
  const stops: RouteStop[] = [];
  let prevBase: string | null = null;
  for (const d of days) {
    const last = stops[stops.length - 1];
    if (d.base === prevBase && last && last.name === d.base) {
      last.to = d.date;
      last.days += 1;
      continue;
    }
    prevBase = d.base;
    if (!d.place) continue;
    stops.push({ n: stops.length + 1, name: d.base, lat: d.place.lat, lng: d.place.lng, from: d.date, to: d.date, days: 1 });
  }
  return stops;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Fit the stops into a width x height box with padding, keeping the shape
 * (longitude shrinks toward the poles). One stop sits in the middle.
 */
export function project(stops: { lat: number; lng: number }[], width: number, height: number, pad: number): Point[] {
  if (stops.length === 0) return [];
  const midLat = (Math.min(...stops.map((s) => s.lat)) + Math.max(...stops.map((s) => s.lat))) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const raw = stops.map((s) => ({ x: s.lng * k, y: -s.lat }));
  const minX = Math.min(...raw.map((p) => p.x));
  const maxX = Math.max(...raw.map((p) => p.x));
  const minY = Math.min(...raw.map((p) => p.y));
  const maxY = Math.max(...raw.map((p) => p.y));
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const scale = spanX === 0 && spanY === 0 ? 0 : Math.min(spanX ? innerW / spanX : Infinity, spanY ? innerH / spanY : Infinity);
  // Center whatever room is left over.
  const offX = pad + (innerW - spanX * scale) / 2;
  const offY = pad + (innerH - spanY * scale) / 2;
  return raw.map((p) => ({ x: round(offX + (p.x - minX) * scale), y: round(offY + (p.y - minY) * scale) }));
}

const round = (n: number) => Math.round(n * 10) / 10;
const ll = (s: { lat: number; lng: number }) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;

/** Google Maps allows up to 9 stops between the start and the end. */
export const MAX_WAYPOINTS = 9;

/** Directions through every stop (thinned evenly if there are too many), or null with fewer than two. */
export function routeUrl(stops: { lat: number; lng: number }[]): string | null {
  // The same place twice in a row adds nothing to directions.
  const path = stops.filter((s, i) => i === 0 || ll(s) !== ll(stops[i - 1]));
  if (path.length < 2) return null;
  let middle = path.slice(1, -1);
  if (middle.length > MAX_WAYPOINTS) {
    const step = middle.length / MAX_WAYPOINTS;
    middle = Array.from({ length: MAX_WAYPOINTS }, (_, i) => middle[Math.floor(i * step)]);
  }
  const params = new URLSearchParams({ api: "1", origin: ll(path[0]), destination: ll(path[path.length - 1]), travelmode: "driving" });
  if (middle.length) params.set("waypoints", middle.map(ll).join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}

export function placeUrl(s: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: ll(s) })}`;
}
