import { addDays, dayCount } from "@/lib/model/inputs";
import type { WeatherDay } from "@/lib/model/place";

/**
 * Weather for the trip's dates from Open-Meteo (free, no key). Within 16 days
 * it's a real forecast; further out, last year's weather on the same dates,
 * labeled as such so nobody mistakes it for a forecast.
 */

const FORECAST_DAYS = 16;

/** WMO weather codes, short and plain. */
export function codeLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return "";
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}

interface Daily {
  time?: string[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  precipitation_probability_max?: (number | null)[];
  precipitation_sum?: (number | null)[];
  weather_code?: (number | null)[];
}

export function parseDaily(daily: Daily | undefined, kind: "forecast" | "last-year", shiftYears = 0): WeatherDay[] {
  if (!daily?.time) return [];
  return daily.time.map((date, i) => ({
    // Last-year data is reported against this year's dates.
    date: shiftYears ? `${Number(date.slice(0, 4)) + shiftYears}${date.slice(4)}` : date,
    high: daily.temperature_2m_max?.[i] ?? null,
    low: daily.temperature_2m_min?.[i] ?? null,
    rain: kind === "forecast" ? (daily.precipitation_probability_max?.[i] ?? null) : (daily.precipitation_sum?.[i] ?? null),
    rainUnit: kind === "forecast" ? "%" : "mm",
    label: codeLabel(daily.weather_code?.[i]),
  }));
}

/** Which source to use, and for what range. Trips longer than 16 days get the forecast part only when it's close. */
export function weatherPlan(from: string, to: string, today: string): { kind: "forecast" | "last-year"; from: string; to: string } {
  const lastForecastDay = addDays(today, FORECAST_DAYS - 1);
  if (from <= lastForecastDay && to >= today) {
    return { kind: "forecast", from: from < today ? today : from, to: to > lastForecastDay ? lastForecastDay : to };
  }
  const back = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
  return { kind: "last-year", from: back(from), to: back(to) };
}

export async function weatherFor(
  lat: number,
  lng: number,
  from: string,
  to: string,
  today: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ kind: "forecast" | "last-year"; days: WeatherDay[] } | null> {
  if (dayCount(from, to) < 1) return null;
  const plan = weatherPlan(from, to, today);
  const base =
    plan.kind === "forecast"
      ? "https://api.open-meteo.com/v1/forecast?daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code"
      : "https://archive-api.open-meteo.com/v1/archive?daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code";
  try {
    const res = await fetchImpl(
      `${base}&latitude=${lat}&longitude=${lng}&timezone=auto&start_date=${plan.from}&end_date=${plan.to}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { daily?: Daily };
    return { kind: plan.kind, days: parseDaily(body.daily, plan.kind, plan.kind === "last-year" ? 1 : 0) };
  } catch {
    return null;
  }
}
