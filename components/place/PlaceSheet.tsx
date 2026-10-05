"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useOnline } from "@/components/shell/useOnline";
import { useNow } from "@/components/shell/useNow";
import { callAi } from "@/lib/ai/client";
import { loadPlace, type PlaceTarget } from "./loadPlace";
import Stargazing from "./Stargazing";
import { watchCachedPlace, watchTripPlaceInfo } from "@/lib/data/places";
import { sunTimes } from "@/lib/grounding/sun";
import type { TripInputs } from "@/lib/model/inputs";
import {
  HAPPENING_STALE_MS,
  mapsSearchUrl,
  placeKey,
  tempIn,
  type CachedPlace,
  type HoursResult,
  type TripPlaceInfo,
} from "@/lib/model/place";
import { formatTime } from "@/lib/model/plan";
import { formatTripDates, type Trip } from "@/lib/model/trip";

export type { PlaceTarget };


/**
 * Everything worth knowing about a stop for these dates. Loads once with
 * signal, then reads offline from the saved copy. Facts come from real
 * sources (Wikipedia, Open-Meteo, Nager.Date, Google); the write-up is AI
 * research with its sources listed.
 */
export default function PlaceSheet({
  trip,
  inputs,
  target,
  from,
  to,
  email,
  onClose,
}: {
  trip: Trip;
  inputs: TripInputs;
  target: PlaceTarget;
  from: string;
  to: string;
  email: string;
  onClose: () => void;
}) {
  const online = useOnline();
  const now = useNow(60_000);
  const key = placeKey(target.name);
  const [cached, setCached] = useState<CachedPlace | null | undefined>(undefined);
  const [saved, setSaved] = useState<TripPlaceInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState<HoursResult | null>(null);
  const [hoursBusy, setHoursBusy] = useState(false);

  useEffect(() => watchCachedPlace(key, setCached), [key]);
  useEffect(() => watchTripPlaceInfo(trip.id, key, setSaved), [trip.id, key]);

  async function load() {
    setBusy(true);
    setError(null);
    const res = await loadPlace({ trip, inputs, target, from, to, email, previous: saved });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.writeUpError) setError(`The write-up didn't load: ${res.writeUpError} The facts below are saved.`);
  }

  // First visit with signal: load automatically. After that, refresh is a tap.
  const needsLoad = saved === null || (saved !== undefined && (saved.from !== from || saved.to !== to));
  useEffect(() => {
    if (!needsLoad || !online || busy || error) return;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsLoad, online]);

  async function getHours() {
    setHoursBusy(true);
    const res = await callAi<HoursResult>("/api/place/hours", {
      query: target.name,
      near: target.lat !== null && target.lng !== null ? { lat: target.lat, lng: target.lng } : null,
    });
    setHoursBusy(false);
    setHours(res.ok ? res.data : { available: false, mapsUrl: mapsSearchUrl(target.name) });
  }

  const units = inputs.units;
  const sun =
    target.lat !== null && target.lng !== null && target.timezone ? sunTimes(from, target.lat, target.lng, target.timezone) : null;
  const stale = saved?.fetchedAt ? now - saved.fetchedAt > HAPPENING_STALE_MS : false;
  const info = saved?.info ?? null;
  const wiki = cached?.wiki ?? null;

  return (
    <Sheet title={target.name} onClose={onClose}>
      <div className="space-y-5 pb-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">{formatTripDates(from, to)}</span>
          <a href={mapsSearchUrl(target.name)} target="_blank" rel="noreferrer" className="font-medium text-accent">
            Open in Maps
          </a>
          {saved && (
            <button type="button" onClick={load} disabled={busy || !online} className="min-h-11 font-medium text-accent disabled:opacity-50">
              {busy ? "Refreshing..." : stale ? "Refresh (it's been a few days)" : "Refresh"}
            </button>
          )}
        </div>

        {busy && !saved && <p className="text-sm text-muted">Looking into {target.name}. This takes up to a minute.</p>}
        {!online && !saved && <p className="text-sm text-warn">Place details need signal the first time. After that they work offline.</p>}
        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}

        {info && (
          <Section title="Why go">
            <p className="text-sm leading-relaxed">{info.summary}</p>
          </Section>
        )}

        {sun && (
          <Section title="Light">
            <p className="text-sm">
              Sunrise {formatTime(sun.sunrise, units)} · golden hour from {formatTime(sun.goldenEvening, units)} · sunset{" "}
              {formatTime(sun.sunset, units)}
            </p>
            <p className="text-xs text-muted">
              {sun.moonLabel} · local time, {from}
            </p>
          </Section>
        )}

        {saved && saved.weather.length > 0 && (
          <Section title={saved.weatherKind === "forecast" ? "Forecast" : "Last year on these dates"}>
            {saved.weatherKind === "last-year" && <p className="mb-2 text-xs text-muted">Not a forecast. A real forecast shows up within 16 days of the trip.</p>}
            <ul className="space-y-1 text-sm">
              {saved.weather.map((d) => (
                <li key={d.date} className="flex justify-between gap-3">
                  <span className="text-muted">{d.date.slice(5)}</span>
                  <span>{d.label}</span>
                  <span>
                    {tempIn(d.high, units)} / {tempIn(d.low, units)}
                  </span>
                  <span className="w-14 text-right text-muted">{d.rain === null ? "" : d.rainUnit === "%" ? `${d.rain}%` : `${d.rain} mm`}</span>
                </li>
              ))}
            </ul>
            <SourceNote>Open-Meteo</SourceNote>
          </Section>
        )}

        {target.lat !== null && target.lng !== null && target.timezone && (
          <Stargazing
            lat={target.lat}
            lng={target.lng}
            timezone={target.timezone}
            from={from}
            to={to}
            units={units}
            nightClouds={saved?.nightClouds ?? []}
            glow={saved?.glow}
          />
        )}

        {saved && saved.holidays.length > 0 && (
          <Section title="Public holidays">
            <ul className="space-y-1 text-sm">
              {saved.holidays.map((h) => (
                <li key={`${h.date}${h.name}`}>
                  <span className="text-muted">{h.date.slice(5)}</span> {h.name}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">Shops and sites may close or be busier than usual.</p>
            <SourceNote>Nager.Date</SourceNote>
          </Section>
        )}

        {info && info.happening.length > 0 && (
          <Section title="Happening during your dates">
            <ul className="space-y-2 text-sm">
              {info.happening.map((h, i) => (
                <li key={i}>
                  {h.url ? (
                    <a href={h.url} target="_blank" rel="noreferrer" className="font-medium text-accent">
                      {h.title}
                    </a>
                  ) : (
                    <span className="font-medium">{h.title}</span>
                  )}
                  <span className="block text-xs text-muted">{h.when}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {info && (
          <Section title="Highlights">
            <ul className="space-y-2 text-sm">
              {info.highlights.map((h, i) => (
                <li key={i}>
                  <span className="font-medium">{h.title}</span>
                  <span className="block text-muted">{h.why}</span>
                </li>
              ))}
            </ul>
            {info.bestTimes.length > 0 && (
              <>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Best times</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {info.bestTimes.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        )}

        {info && info.tips.length > 0 && (
          <Section title="Tips">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {info.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </Section>
        )}

        {(info || wiki) && (
          <Section title="History">
            {info && <p className="text-sm leading-relaxed">{info.history}</p>}
            {wiki && (
              <a href={wiki.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-accent">
                Wikipedia: {wiki.title}
              </a>
            )}
          </Section>
        )}

        <Section title="Opening hours">
          {hours === null ? (
            <button
              type="button"
              onClick={getHours}
              disabled={hoursBusy || !online}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50"
            >
              {hoursBusy ? "Checking..." : online ? "Get opening hours" : "Opening hours need signal"}
            </button>
          ) : hours.available ? (
            <>
              <p className="text-sm font-medium">{hours.name}</p>
              {hours.address && <p className="text-xs text-muted">{hours.address}</p>}
              <ul className="mt-2 space-y-0.5 text-sm">
                {hours.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <SourceNote>Google, checked just now. Holidays can change hours.</SourceNote>
            </>
          ) : (
            <a href={hours.mapsUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent">
              Check hours on Google Maps
            </a>
          )}
        </Section>

        {info && (
          <div className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
            <p>The write-up is AI research. Double-check anything that matters before you go.</p>
            {saved && saved.sources.length > 0 && (
              <ul className="mt-2 space-y-1">
                {saved.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-accent">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function SourceNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-muted">Source: {children}</p>;
}
