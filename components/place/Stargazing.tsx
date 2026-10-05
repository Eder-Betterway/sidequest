"use client";

import { useMemo } from "react";
import { hoursText, nightSky, rateNight, type Glow, type Rating } from "@/lib/grounding/sky";
import { addDays } from "@/lib/model/inputs";
import type { NightCloud } from "@/lib/model/place";
import { formatTime } from "@/lib/model/plan";

const MAX_NIGHTS = 14;

const TONE: Record<Rating, string> = {
  Great: "bg-accent text-on-accent",
  Good: "bg-accent-soft text-accent",
  Fair: "bg-surface-2 text-text",
  Poor: "bg-surface-2 text-muted",
};

/**
 * Each night of the stay: when it's properly dark with the moon out of the
 * way, whether the Milky Way core is up, forecast clouds, and how much town
 * glow to expect. The sky math runs on the phone, so it works offline.
 */
export default function Stargazing({
  lat,
  lng,
  timezone,
  from,
  to,
  units,
  nightClouds,
  glow,
}: {
  lat: number;
  lng: number;
  timezone: string;
  from: string;
  to: string;
  units: "imperial" | "metric";
  nightClouds: NightCloud[];
  glow: Glow | null | undefined;
}) {
  const nights = useMemo(() => {
    const list = [];
    for (let d = from; d <= to && list.length < MAX_NIGHTS; d = addDays(d, 1)) list.push(nightSky(d, lat, lng, timezone));
    return list;
  }, [from, to, lat, lng, timezone]);
  const t = (hhmm: string | null) => (hhmm ? formatTime(hhmm, units) : "");
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <section aria-label="Stargazing">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Stargazing</h3>
      {glow && (
        <p className="mb-2 text-sm">
          <span className="font-medium">{glow.label}.</span>
          {glow.sources[0] && (
            <span className="text-muted">
              {" "}
              Most glow from {glow.sources[0].name} ({units === "imperial" ? `${Math.round(glow.sources[0].km * 0.621)} mi` : `${glow.sources[0].km} km`}).
            </span>
          )}
        </p>
      )}
      <ul className="space-y-3">
        {nights.map((n) => {
          const cloud = nightClouds.find((c) => c.date === n.date)?.cloud ?? null;
          const rating = rateNight(n, cloud, glow?.index ?? null);
          return (
            <li key={n.date} className="text-sm">
              <p className="flex items-center gap-2">
                <span className="font-medium">{day(n.date)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[rating]}`}>{rating}</span>
              </p>
              <p className="text-muted">
                {n.moonlessMin > 0
                  ? `Dark with no moon ${t(n.bestFrom)} to ${t(n.bestTo)} (${hoursText(n.moonlessMin)})`
                  : n.astroDarkMin > 0
                    ? "The moon is up all night"
                    : "It never gets fully dark"}
                {` · moon ${Math.round(n.moonLit * 100)}% lit`}
                {cloud !== null && ` · clouds ${cloud}%`}
              </p>
              <p className="text-muted">
                {n.milkyWay ? `Milky Way core up ${t(n.milkyWay.from)} to ${t(n.milkyWay.to)}` : "Milky Way core not up while it's dark (its season is roughly March to October)"}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-muted">
        Moon and Milky Way worked out on your phone. Clouds: Open-Meteo forecast{nightClouds.length ? "" : " (shows within 16 days)"}. Town glow: a rough estimate from OpenStreetMap populations; it can&apos;t see haze or a lit-up mine.
      </p>
    </section>
  );
}
