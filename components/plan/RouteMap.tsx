"use client";

import { formatTripDates } from "@/lib/model/trip";
import { placeUrl, project, routeStops, routeUrl } from "@/lib/plan/map";
import type { PlanState } from "./usePlan";

const W = 320;
const H = 200;
const PAD = 22;

/**
 * The route at a glance: numbered stops joined in order. Drawn from the
 * stops' coordinates, so it shows with no signal. Tap a stop in the list to
 * jump to it in the itinerary.
 */
export default function RouteMap({ days, onStop }: { days: PlanState["days"]; onStop: (from: string) => void }) {
  const stops = routeStops(days);
  if (stops.length === 0) return null;
  const pts = project(stops, W, H, PAD);
  const directions = routeUrl(stops);
  // A stop you come back to gets one pin with both numbers.
  const pins = new Map<string, { x: number; y: number; ns: number[] }>();
  pts.forEach((p, i) => {
    const key = `${p.x},${p.y}`;
    const pin = pins.get(key);
    if (pin) pin.ns.push(stops[i].n);
    else pins.set(key, { ...p, ns: [stops[i].n] });
  });

  return (
    <section aria-label="Route map" className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">The route</h2>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${stops.length} ${stops.length === 1 ? "stop" : "stops"}: ${stops.map((s) => s.name).join(", then ")}`} className="mt-2 w-full rounded-xl bg-surface-2">
        {pts.length > 1 && (
          <polyline
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.5}
            strokeDasharray="1 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.7}
          />
        )}
        {[...pins.values()].map((p) => {
          const label = p.ns.join(",");
          const r = label.length > 2 ? 13 : 10;
          return (
            <g key={label}>
              <circle cx={p.x} cy={p.y} r={r} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={label.length > 2 ? 9 : 11} fontWeight={700} fill="var(--on-accent)">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <ol className="mt-3 space-y-1">
        {stops.map((s) => (
          <li key={`${s.n}-${s.from}`} className="flex items-center gap-2">
            <button type="button" onClick={() => onStop(s.from)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-on-accent">{s.n}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="block text-xs text-muted">
                  {formatTripDates(s.from, s.to)} · {s.days} {s.days === 1 ? "day" : "days"}
                </span>
              </span>
            </button>
            <a href={placeUrl(s)} target="_blank" rel="noreferrer" aria-label={`${s.name} in Google Maps`} className="flex min-h-11 shrink-0 items-center px-2 text-xs font-medium text-accent">
              Map ›
            </a>
          </li>
        ))}
      </ol>
      {directions && (
        <a
          href={directions}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border border-border text-sm font-semibold"
        >
          Open the route in Google Maps
        </a>
      )}
      <p className="mt-1 text-center text-xs text-muted">A sketch of where you&apos;ll be, not the roads. Google Maps needs signal.</p>
    </section>
  );
}
