"use client";

import { recGovSearchUrl, type ParksInfo } from "@/lib/grounding/parks";

const CHIP: Record<string, string> = {
  "Park Closure": "bg-warn text-on-accent",
  Danger: "bg-warn text-on-accent",
  Caution: "bg-accent-soft text-accent",
};

/**
 * US stops: the national park here with its live alerts, and campgrounds
 * you can reserve on Recreation.gov. Alerts are as of the last refresh.
 */
export default function Parks({
  placeName,
  parks,
  fetchedAt,
  units,
}: {
  placeName: string;
  parks: ParksInfo | null | undefined;
  fetchedAt: number | null;
  units: "imperial" | "metric";
}) {
  const dist = (km: number) => (units === "imperial" ? `${Math.round(km * 0.621)} mi` : `${km} km`);
  const park = parks?.park ?? null;
  const camps = parks?.campgrounds ?? [];

  return (
    <section aria-label="Parks and campgrounds">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Parks and campgrounds</h3>
      {park ? (
        <div className="text-sm">
          <a href={park.url} target="_blank" rel="noreferrer" className="font-medium text-accent">
            {park.name}
          </a>
          <span className="text-muted"> · {park.km <= 2 ? "you're in it" : `${dist(park.km)} away`}</span>
          {park.alerts.length === 0 ? (
            <p className="mt-1 text-muted">No current park alerts.</p>
          ) : (
            <ul aria-label="Park alerts" className="mt-2 space-y-2">
              {park.alerts.map((a, i) => (
                <li key={i}>
                  <details>
                    <summary className="cursor-pointer list-none">
                      <span className={`mr-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[a.category] ?? "bg-surface-2 text-muted"}`}>{a.category}</span>
                      <span className="font-medium">{a.title}</span>
                    </summary>
                    <p className="mt-1 text-muted">{a.description}</p>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-accent">
                        More from the park ›
                      </a>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        parks?.checked.nps === false && (
          <a href="https://www.nps.gov/findapark/index.htm" target="_blank" rel="noreferrer" className="text-sm font-medium text-accent">
            Check park alerts on nps.gov ›
          </a>
        )
      )}

      {camps.length > 0 ? (
        <>
          <p className="mt-3 text-sm font-medium">Reservable campgrounds nearby</p>
          <ul className="mt-1 space-y-1 text-sm">
            {camps.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  {c.name} <span className="text-muted">· {dist(c.km)}</span>
                </span>
                <a href={c.url} target="_blank" rel="noreferrer" aria-label={`Book ${c.name}`} className="flex min-h-11 shrink-0 items-center text-xs font-medium text-accent">
                  Book ›
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <a href={recGovSearchUrl(placeName)} target="_blank" rel="noreferrer" className="mt-2 flex min-h-11 items-center text-sm font-medium text-accent">
          Search campgrounds on Recreation.gov ›
        </a>
      )}
      <p className="mt-1 text-[11px] text-muted">
        Source: National Park Service and Recreation.gov
        {fetchedAt ? `, as of ${new Date(fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}. Refresh before you go; alerts change.
      </p>
    </section>
  );
}
