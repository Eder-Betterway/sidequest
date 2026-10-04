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
import { useNotes } from "@/components/notes/useNotes";
import { useDrafts } from "@/components/plan/useDrafts";
import TripVibeSheet from "@/components/plan/TripVibeSheet";
import Itinerary from "@/components/plan/Itinerary";
import ChangeSheet from "@/components/plan/ChangeSheet";
import TripProposalSheet from "@/components/plan/TripProposalSheet";
import { acceptTripProposal, dismissTripProposal } from "@/lib/data/plan";
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

type View = "itinerary" | "days" | "options";

function OpenTrip({ trip, email, onDeleted }: { trip: Trip; email: string; onDeleted: () => void }) {
  const plan = usePlan(trip.id);
  const { notes } = useNotes(trip.id);
  const drafts = useDrafts(trip.id);
  const inputs = readInputs(trip.inputs);
  const [wizard, setWizard] = useState(false);
  const [vibeOpen, setVibeOpen] = useState(false);
  const [view, setView] = useState<View>("itinerary");
  const [selected, setSelected] = useState<string | null>(null);
  const [changing, setChanging] = useState<{ focusDate: string | null } | null>(null);
  const [reviewingTrip, setReviewingTrip] = useState(false);
  const tripProposal = plan.tripProposals[plan.tripProposals.length - 1];
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
          options={["itinerary", "days", "options"] as const}
          value={view}
          onChange={setView}
        />
      )}

      {tripProposal && hasDays && (
        <button
          type="button"
          onClick={() => setReviewingTrip(true)}
          className="flex min-h-12 w-full items-center justify-between rounded-xl bg-accent-soft px-3 text-left text-sm font-semibold text-accent"
        >
          Suggested trip changes ready
          <span aria-hidden>›</span>
        </button>
      )}

      {!plan.loaded ? (
        <p className="py-6 text-center text-sm text-muted">Loading the plan...</p>
      ) : showing === "itinerary" ? (
        <Itinerary
          trip={trip}
          inputs={inputs}
          plan={plan}
          notes={notes}
          drafts={drafts}
          email={email}
          onOpenDay={(date) => {
            setSelected(date);
            setView("days");
          }}
          onChange={(focusDate) => setChanging({ focusDate })}
        />
      ) : showing === "days" ? (
        <DayPlan
          trip={trip}
          inputs={inputs}
          plan={plan}
          email={email}
          notes={notes}
          drafts={drafts}
          selected={selected}
          onSelect={setSelected}
          onChangeDay={(date) => setChanging({ focusDate: date })}
        />
      ) : (
        <OptionsView
          trip={trip}
          inputs={inputs}
          plan={plan}
          email={email}
          onEditInputs={() => setWizard(true)}
          onPlanned={() => setView("itinerary")}
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
                    noteIds: notes.map((n) => n.id),
                    draftIds: drafts.map((d) => d.id),
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
      {changing && (
        <ChangeSheet
          trip={trip}
          inputs={inputs}
          plan={plan}
          drafts={drafts}
          email={email}
          focusDate={changing.focusDate}
          onClose={() => setChanging(null)}
          onReview={() => {
            setChanging(null);
            setReviewingTrip(true);
          }}
        />
      )}
      {reviewingTrip && tripProposal && (
        <TripProposalSheet
          proposal={tripProposal}
          days={plan.days}
          items={plan.items}
          units={inputs.units}
          onClose={() => setReviewingTrip(false)}
          onDismiss={() => {
            dismissTripProposal(trip.id, tripProposal.id);
            setReviewingTrip(false);
          }}
          onApply={(keep) => {
            acceptTripProposal(trip.id, tripProposal, keep, plan.items, email);
            setReviewingTrip(false);
          }}
        />
      )}
      {vibeOpen && <TripVibeSheet trip={trip} inputs={inputs} plan={plan} email={email} onClose={() => setVibeOpen(false)} />}
    </div>
  );
}
