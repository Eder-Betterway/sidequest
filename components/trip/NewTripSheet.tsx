"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { createTrip } from "@/lib/data/trips";
import { prefs } from "@/lib/prefs";
import { useOnline } from "@/components/shell/useOnline";
import { callAi, todayIso } from "@/lib/ai/client";
import { summarize, toTripStart, type QuickStart, type TripStart } from "@/lib/model/quickstart";

const field =
  "mt-1 block min-h-12 w-full rounded-xl border border-border bg-bg px-3 text-base outline-none focus:border-accent";

/**
 * Start a trip: describe it in a sentence and let Claude fill in the details
 * (you review them first), or just give it a name and dates and fill in the
 * rest with the trip wizard later.
 */
export default function NewTripSheet({
  email,
  onClose,
  onCreated,
}: {
  email: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [partnerEmail, setPartnerEmail] = useState(() => prefs.partnerEmail());
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const [describe, setDescribe] = useState("");
  const [reading, setReading] = useState(false);
  const [filled, setFilled] = useState<TripStart | null>(null);

  async function fillIn() {
    setReading(true);
    setError(null);
    const today = todayIso();
    const res = await callAi<{ start: QuickStart }>("/api/ai/quickstart", { text: describe, today });
    setReading(false);
    if (!res.ok) return setError(res.error);
    const start = toTripStart(res.data.start, today);
    setFilled(start);
    setTitle(start.title);
    setStartDate(start.startDate ?? "");
    setEndDate(start.endDate ?? "");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = createTrip({ title, startDate, endDate, partnerEmail }, email, filled?.inputs);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    prefs.setPartnerEmail(partnerEmail.trim());
    onCreated(result.id);
  }

  return (
    <Sheet title="New trip" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <section aria-label="Describe it" className="rounded-2xl bg-surface-2 p-3">
          <label className="block">
            <span className="text-sm font-medium">Describe it in a sentence (optional)</span>
            <textarea
              value={describe}
              onChange={(e) => setDescribe(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Two weeks from Nov 1, SoCal desert in the van, wedding in Palm Springs on the 13th, we love climbing and hot springs"
              className={`${field} py-2`}
            />
          </label>
          <button
            type="button"
            onClick={fillIn}
            disabled={reading || !online || describe.trim().length < 5}
            className="mt-2 min-h-11 w-full rounded-xl border border-accent font-semibold text-accent disabled:opacity-50"
          >
            {reading ? "Filling it in..." : online ? "Fill in the details" : "Filling in needs signal"}
          </button>
          {filled && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Also filled in</p>
              {summarize(filled).length ? (
                <dl className="mt-1 space-y-1 text-sm">
                  {summarize(filled).map((r) => (
                    <div key={r.label}>
                      <dt className="inline text-muted">{r.label}: </dt>
                      <dd className="inline">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-1 text-sm text-muted">Just the name and dates. Add the rest in Trip details.</p>
              )}
              <p className="mt-2 text-xs text-muted">Check the name and dates below. You can change any of it later in Trip details.</p>
            </div>
          )}
        </section>

        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Desert loop, Fall in the Rockies..."
            className={field}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Start</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">End</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={field} />
          </label>
        </div>
        <p className="-mt-2 text-xs text-muted">Dates can stay loose. Fill them in whenever.</p>
        <label className="block">
          <span className="text-sm font-medium">Traveling with</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={partnerEmail}
            onChange={(e) => setPartnerEmail(e.target.value)}
            placeholder="Their Sidequest email"
            className={field}
          />
          <span className="mt-1 block text-xs text-muted">They&apos;ll see and edit this trip on their phone.</span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}

        <button type="submit" className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent">
          Create trip
        </button>
      </form>
    </Sheet>
  );
}
