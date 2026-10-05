"use client";

import { callAi, todayIso } from "@/lib/ai/client";
import type { Usage } from "@/lib/ai/claude";
import { saveCachedPlace, saveTripPlaceInfo } from "@/lib/data/places";
import type { TripInputs } from "@/lib/model/inputs";
import type { Glow } from "@/lib/grounding/sky";
import { placeKey, type NightCloud, type Holiday, type PlaceInfo, type Source, type TripPlaceInfo, type WeatherDay, type WikiSummary } from "@/lib/model/place";
import type { Trip } from "@/lib/model/trip";

export interface PlaceTarget {
  name: string;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
  countryCode: string | null;
}

type Facts = {
  wiki: WikiSummary | null;
  weather: { kind: "forecast" | "last-year"; days: WeatherDay[] } | null;
  holidays: Holiday[];
  nightClouds?: NightCloud[];
  glow?: Glow | null;
};

/**
 * Look up a place for these dates and save it for offline: real facts
 * (Wikipedia, weather, holidays) always; the AI write-up unless `withWriteUp`
 * is false. Shared by the place sheet and "get ready for no signal".
 */
export async function loadPlace(args: {
  trip: Trip;
  inputs: TripInputs;
  target: PlaceTarget;
  from: string;
  to: string;
  email: string;
  previous?: TripPlaceInfo | null;
  withWriteUp?: boolean;
}): Promise<{ ok: true; writeUpError: string | null } | { ok: false; error: string }> {
  const { trip, inputs, target, from, to, email, previous } = args;
  if (!trip.startDate || !trip.endDate) return { ok: false, error: "The trip needs dates first." };
  const key = placeKey(target.name);
  const today = todayIso();
  const facts = await callAi<Facts>("/api/place/facts", {
    place: { name: target.name, lat: target.lat, lng: target.lng, countryCode: target.countryCode },
    from,
    to,
    today,
  });
  if (!facts.ok) return facts;

  const ai =
    args.withWriteUp === false
      ? null
      : await callAi<{ info: PlaceInfo; sources: Source[]; usage: Usage | null }>("/api/ai/place", {
          trip: { title: trip.title, startDate: trip.startDate, endDate: trip.endDate },
          inputs,
          place: { name: target.name },
          from,
          to,
          today,
          wiki: facts.data.wiki,
        });
  const got = ai?.ok ? ai.data : null;
  saveCachedPlace({ key, name: target.name, wiki: facts.data.wiki, refreshedAt: Date.now() });
  saveTripPlaceInfo(
    trip.id,
    {
      key,
      name: target.name,
      info: got ? got.info : (previous?.info ?? null),
      sources: got ? got.sources : (previous?.sources ?? []),
      weather: facts.data.weather?.days ?? [],
      weatherKind: facts.data.weather?.kind ?? null,
      holidays: facts.data.holidays,
      nightClouds: facts.data.nightClouds ?? [],
      // Keep the last good estimate if the lookup failed this time.
      glow: facts.data.glow ?? previous?.glow ?? null,
      from,
      to,
      fetchedAt: Date.now(),
    },
    got?.usage ?? null,
    email
  );
  return { ok: true, writeUpError: ai && !ai.ok ? ai.error : null };
}
