"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { createTrip } from "@/lib/data/trips";
import { prefs } from "@/lib/prefs";

const field =
  "mt-1 block min-h-12 w-full rounded-xl border border-border bg-bg px-3 text-base outline-none focus:border-accent";

/**
 * Start a trip with the basics. The full set of inputs (regions, milestones,
 * transport, interests) comes with the trip wizard.
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = createTrip({ title, startDate, endDate, partnerEmail }, email);
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
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            autoFocus
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
