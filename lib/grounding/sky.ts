import * as SunCalc from "suncalc";
import { timeIn } from "./sun";

/**
 * Stargazing for a night at a place, worked out on the phone (works offline):
 * when it's truly dark (sun 18 degrees down), when the moon is out of the way,
 * and when the Milky Way's bright core is up. Clouds and light pollution come
 * from the server (Open-Meteo, OpenStreetMap) and are folded in by `rateNight`.
 */

const STEP_MIN = 10;
const RAD = Math.PI / 180;
/** The galactic center (Sagittarius A*), J2000. */
const CORE = { ra: 266.405, dec: -29.008 };
/** The core is worth looking for once it's this high. */
const CORE_MIN_ALT = 10;
/** A moon this thin barely washes out the sky. */
const DIM_MOON = 0.12;

export interface Night {
  /** The evening's date (the night of Nov 3 runs into Nov 4). */
  date: string;
  /** Minutes with the sun 18+ degrees down. */
  astroDarkMin: number;
  /** Minutes that are astronomically dark AND the moon is down or dim. */
  moonlessMin: number;
  /** The longest moonless dark stretch, local "HH:MM". */
  bestFrom: string | null;
  bestTo: string | null;
  /** Moon brightness 0 to 1. */
  moonLit: number;
  /** When the Milky Way core is up during the moonless dark, if at all. */
  milkyWay: { from: string; to: string } | null;
}

/** Degrees the galactic core sits above the horizon at a moment. */
export function coreAltitude(when: Date, lat: number, lng: number): number {
  const jd = when.getTime() / 86_400_000 + 2440587.5;
  const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360;
  const ha = (gmst + lng - CORE.ra) * RAD;
  const sinAlt = Math.sin(lat * RAD) * Math.sin(CORE.dec * RAD) + Math.cos(lat * RAD) * Math.cos(CORE.dec * RAD) * Math.cos(ha);
  return Math.asin(sinAlt) / RAD;
}

/** Evening of `date` (local noon there) to the next local noon, in steps. */
function samples(date: string, lng: number): Date[] {
  // Local noon, roughly, from the place's longitude.
  const start = Date.parse(`${date}T12:00:00Z`) - (lng / 15) * 3_600_000;
  return Array.from({ length: (24 * 60) / STEP_MIN }, (_, i) => new Date(start + i * STEP_MIN * 60_000));
}

function longestRun(flags: boolean[]): { start: number; len: number } {
  let best = { start: -1, len: 0 };
  let cur = -1;
  flags.forEach((f, i) => {
    if (f && cur < 0) cur = i;
    if ((!f || i === flags.length - 1) && cur >= 0) {
      const end = f ? i + 1 : i;
      if (end - cur > best.len) best = { start: cur, len: end - cur };
      cur = -1;
    }
  });
  return best;
}

export function nightSky(date: string, lat: number, lng: number, timeZone: string): Night {
  const times = samples(date, lng);
  const midnight = times[times.length / 2];
  const moonLit = SunCalc.getMoonIllumination(midnight).fraction;
  // suncalc 2 reports altitudes in degrees.
  const dark = times.map((t) => SunCalc.getPosition(t, lat, lng).altitude < -18);
  const moonless = times.map((t, i) => dark[i] && (moonLit < DIM_MOON || SunCalc.getMoonPosition(t, lat, lng).altitude < 0));
  const core = times.map((t, i) => moonless[i] && coreAltitude(t, lat, lng) > CORE_MIN_ALT);

  const best = longestRun(moonless);
  const mw = longestRun(core);
  const at = (i: number) => timeIn(times[Math.min(i, times.length - 1)], timeZone);
  return {
    date,
    astroDarkMin: dark.filter(Boolean).length * STEP_MIN,
    moonlessMin: moonless.filter(Boolean).length * STEP_MIN,
    bestFrom: best.len ? at(best.start) : null,
    bestTo: best.len ? at(best.start + best.len) : null,
    moonLit: Math.round(moonLit * 100) / 100,
    // Under 30 minutes isn't worth staying up for.
    milkyWay: mw.len * STEP_MIN >= 30 ? { from: at(mw.start)!, to: at(mw.start + mw.len)! } : null,
  };
}

// ---------- Light pollution ----------

export interface Glow {
  /** Walker's law sum: population / km^2.5 for each town around. */
  index: number;
  label: string;
  /** The biggest contributors, brightest first. */
  sources: { name: string; population: number; km: number }[];
}

/**
 * How much town light reaches this sky, by Walker's law (glow grows with a
 * town's population and fades with distance to the 2.5 power). A rough
 * estimate: it can't see terrain, haze, or one bright mine.
 */
export function glowFrom(towns: { name: string; population: number; km: number }[]): Glow {
  const parts = towns
    .filter((t) => t.population > 0)
    .map((t) => ({ ...t, glow: t.population / Math.pow(Math.max(t.km, 3), 2.5) }))
    .sort((a, b) => b.glow - a.glow);
  const index = Math.round(parts.reduce((s, p) => s + p.glow, 0) * 10) / 10;
  return { index, label: glowLabel(index), sources: parts.slice(0, 3).map(({ name, population, km }) => ({ name, population, km: Math.round(km) })) };
}

export function glowLabel(index: number): string {
  if (index < 2) return "Very dark: no town glow to speak of";
  if (index < 15) return "Dark: faint glow low on the horizon";
  if (index < 80) return "Fairly dark: a town glow on one side";
  if (index < 500) return "Suburban: only bright stars and planets";
  return "City sky: little beyond the moon and planets";
}

export type Rating = "Great" | "Good" | "Fair" | "Poor";

/** One word for the night, from dark time, the moon, clouds (when forecast), and town glow. */
export function rateNight(n: Pick<Night, "moonlessMin">, cloudPct: number | null, glowIndex: number | null): Rating {
  let score = Math.min(n.moonlessMin / 240, 1) * 3; // up to 3 for four moonless dark hours
  if (glowIndex !== null) score += glowIndex < 2 ? 2 : glowIndex < 15 ? 1.5 : glowIndex < 80 ? 1 : glowIndex < 500 ? 0.3 : 0;
  else score += 1;
  if (cloudPct !== null) {
    if (cloudPct >= 70) return "Poor";
    score -= cloudPct >= 40 ? 1.5 : cloudPct >= 20 ? 0.5 : 0;
  }
  return score >= 4.2 ? "Great" : score >= 3 ? "Good" : score >= 1.5 ? "Fair" : "Poor";
}

export function hoursText(min: number): string {
  if (min <= 0) return "none";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
