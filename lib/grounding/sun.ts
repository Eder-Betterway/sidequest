import * as SunCalc from "suncalc";

/**
 * Sunrise, golden hour, sunset, and moon for a day at a place, computed on the
 * phone (works offline) and shown in the destination's time zone, not the
 * phone's. Never from the AI.
 */

export interface SunTimes {
  sunrise: string | null;
  /** Morning golden hour ends. */
  goldenMorningEnd: string | null;
  /** Evening golden hour starts. */
  goldenEvening: string | null;
  sunset: string | null;
  /** Blue hour / civil dusk. */
  dusk: string | null;
  /** 0 = new moon, 0.5 = full moon. */
  moonPhase: number;
  moonLabel: string;
}

/** "HH:MM" in the given IANA time zone, or null for invalid dates (polar day/night). */
export function timeIn(d: Date | null, timeZone: string): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value;
  const m = parts.find((p) => p.type === "minute")?.value;
  return h && m ? `${h}:${m}` : null;
}

/** Noon local-ish anchor so SunCalc picks the right calendar day for the place. */
function anchor(isoDate: string, lng: number): Date {
  // Shift from UTC noon by the place's rough solar offset (15 degrees per hour).
  return new Date(Date.parse(`${isoDate}T12:00:00Z`) - (lng / 15) * 3_600_000);
}

export function moonLabel(phase: number): string {
  if (phase < 0.03 || phase > 0.97) return "New moon (dark skies)";
  if (phase < 0.22) return "Waxing crescent";
  if (phase < 0.28) return "First quarter";
  if (phase < 0.47) return "Waxing gibbous";
  if (phase < 0.53) return "Full moon";
  if (phase < 0.72) return "Waning gibbous";
  if (phase < 0.78) return "Last quarter";
  return "Waning crescent";
}

export function sunTimes(isoDate: string, lat: number, lng: number, timeZone: string): SunTimes {
  const t = SunCalc.getTimes(anchor(isoDate, lng), lat, lng);
  const phase = SunCalc.getMoonIllumination(anchor(isoDate, lng)).phase;
  return {
    sunrise: timeIn(t.sunrise, timeZone),
    goldenMorningEnd: timeIn(t.goldenHourEnd, timeZone),
    goldenEvening: timeIn(t.goldenHour, timeZone),
    sunset: timeIn(t.sunset, timeZone),
    dusk: timeIn(t.dusk, timeZone),
    moonPhase: phase,
    moonLabel: moonLabel(phase),
  };
}
