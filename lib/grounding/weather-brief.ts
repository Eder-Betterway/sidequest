import type { WeatherDay } from "@/lib/model/place";
import { weatherFor } from "./weather";

/**
 * A compact weather summary for every stop on the trip, so whole-trip
 * questions and re-plans can weigh the weather. Real forecast within 16 days,
 * otherwise last year's weather on the same dates, and it says which.
 */

export interface Stay {
  base: string;
  from: string;
  to: string;
  lat: number;
  lng: number;
}

const MAX_STAYS = 12;

/** Consecutive days at the same base, with coordinates. */
export function stays(days: { date: string; base: string; lat: number | null; lng: number | null }[]): Stay[] {
  const out: Stay[] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && last.base === d.base) {
      last.to = d.date;
      continue;
    }
    if (d.lat === null || d.lng === null) continue;
    out.push({ base: d.base, from: d.date, to: d.date, lat: d.lat, lng: d.lng });
  }
  return out.slice(0, MAX_STAYS);
}

export function formatWeatherBrief(rows: { stay: Stay; kind: "forecast" | "last-year"; days: WeatherDay[] }[]): string {
  return rows
    .filter((r) => r.days.length)
    .map(({ stay, kind, days }) => {
      const each = days
        .map((d) => {
          const temp = d.high !== null && d.low !== null ? ` ${Math.round(d.high)}/${Math.round(d.low)}°C` : "";
          const rain = d.rain === null ? "" : d.rainUnit === "%" ? `, ${d.rain}% rain` : `, ${d.rain} mm rain`;
          return `${d.date.slice(5)} ${d.label || "?"}${temp}${rain}`;
        })
        .join("; ");
      return `- ${stay.base}, ${stay.from} to ${stay.to} (${kind === "forecast" ? "forecast" : "last year, not a forecast"}): ${each}`;
    })
    .join("\n");
}

/** Never fails: no weather is better than no answer. */
export async function weatherBrief(
  days: { date: string; base: string; lat: number | null; lng: number | null }[],
  today: string
): Promise<string> {
  const list = stays(days);
  const rows = await Promise.all(
    list.map(async (stay) => {
      const w = await weatherFor(stay.lat, stay.lng, stay.from, stay.to, today);
      return w ? { stay, ...w } : null;
    })
  );
  return formatWeatherBrief(rows.filter((r): r is NonNullable<typeof r> => r !== null));
}
