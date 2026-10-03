"use client";

import { useState } from "react";
import { deleteTripWithPlan } from "@/lib/data/plan";
import { readInputs } from "@/lib/model/inputs";
import { formatTripDates, type Trip } from "@/lib/model/trip";
import { Segmented } from "@/components/ui/fields";
import TripWizard from "@/components/plan/TripWizard";
import OptionsView from "@/components/plan/OptionsView";
import DayPlan from "@/components/plan/DayPlan";
import { usePlan } from "@/components/plan/usePlan";
import TripVibeSheet from "@/components/plan/TripVibeSheet";
import { Notice } from "./TripsView";

/** The open trip: its day plan once there is one, otherwise the options to build it from. */
export default function PlanView({
  trip,
  email,
  onDeleted,
}: {
  trip: Trip | null;
  email: string;
  onDeleted: () => void;
}) {
  if (!trip) {
    return <Notice title="No trip open">Pick a trip on the Trips tab, or start a new one.</Notice>;
  }
  // Keyed so switching trips resets everything inside.
  return <OpenTrip key={trip.id} trip={trip} email={email} onDeleted={onDeleted} />;
}

function OpenTrip({ trip, email, onDeleted }: { trip: Trip; email: string; onDeleted: () => void }) {
  const plan = usePlan(trip.id);
  const inputs = readInputs(trip.inputs);
  const [wizard, setWizard] = useState(false);
  const [vibeOpen, setVibeOpen] = useState(false);
  const [view, setView] = useState<"days" | "options">("days");
  const [confirming, setConfirming] = useState(false);

  const hasDays = plan.days.length > 0;
  const showing = hasDays ? view : "options";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
        <div className="flex gap-4">
          {hasDays && (
            <button type="button" onClick={() => setVibeOpen(true)} className="min-h-11 text-sm font-medium text-accent">
              Trip vibe
            </button>
          )}
          <button type="button" onClick={() => setWizard(true)} className="min-h-11 text-sm font-medium text-accent">
            Trip details
          </button>
        </div>
      </div>

      {hasDays && (
        <Segmented
          label="Show"
          options={["days", "options"] as const}
          value={view}
          onChange={setView}
        />
      )}

      {!plan.loaded ? (
        <p className="py-6 text-center text-sm text-muted">Loading the plan...</p>
      ) : showing === "days" ? (
        <DayPlan trip={trip} inputs={inputs} plan={plan} email={email} />
      ) : (
        <OptionsView
          trip={trip}
          inputs={inputs}
          plan={plan}
          email={email}
          onEditInputs={() => setWizard(true)}
          onPlanned={() => setView("days")}
        />
      )}

      <div className="pt-6">
        {confirming ? (
          <div className="rounded-2xl border border-warn/40 bg-surface p-4">
            <p className="text-sm">Delete &quot;{trip.title}&quot; for everyone on it? This can&apos;t be undone.</p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  deleteTripWithPlan(trip.id, {
                    optionIds: plan.options.map((o) => o.id),
                    dayIds: plan.days.map((d) => d.id),
                    itemIds: plan.items.map((i) => i.id),
                  });
                  onDeleted();
                }}
                className="min-h-11 flex-1 rounded-xl bg-warn font-semibold text-on-accent"
              >
                Delete
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="min-h-11 flex-1 rounded-xl border border-border font-medium">
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="min-h-11 text-sm text-muted underline">
            Delete this trip
          </button>
        )}
      </div>

      {wizard && <TripWizard trip={trip} initial={inputs} onClose={() => setWizard(false)} />}
      {vibeOpen && <TripVibeSheet trip={trip} inputs={inputs} plan={plan} email={email} onClose={() => setVibeOpen(false)} />}
    </div>
  );
}
