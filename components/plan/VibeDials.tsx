"use client";

import { DIALS, dialWords, type DialKey, type Vibe } from "@/lib/plan/vibe";

/**
 * The four dials as big, thumb-friendly sliders. `inherited` marks dials that
 * follow the trip's vibe (shown dimmer) on a day's panel.
 */
export default function VibeDials({
  value,
  onChange,
  inherited,
  idPrefix,
}: {
  value: Vibe;
  onChange: (key: DialKey, v: number) => void;
  inherited?: Set<DialKey>;
  idPrefix: string;
}) {
  return (
    <div className="space-y-5">
      {DIALS.map((d) => {
        const id = `${idPrefix}-${d.key}`;
        const v = value[d.key];
        const dim = inherited?.has(d.key);
        return (
          <div key={d.key}>
            <div className="flex items-baseline justify-between">
              <label htmlFor={id} className="text-sm font-semibold">
                {d.label}
              </label>
              <span className={`text-xs ${dim ? "text-muted" : "font-medium text-accent"}`}>
                {dialWords(d.key, v)}
                {dim ? " (trip)" : ""}
              </span>
            </div>
            <input
              id={id}
              type="range"
              min={0}
              max={100}
              step={5}
              value={v}
              onChange={(e) => onChange(d.key, Number(e.target.value))}
              aria-valuetext={`${d.label}: ${dialWords(d.key, v)}`}
              className={`mt-2 h-8 w-full accent-[var(--accent)] ${dim ? "opacity-60" : ""}`}
            />
            <div className="flex justify-between text-[11px] text-muted">
              <span>{d.low}</span>
              <span>{d.high}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
