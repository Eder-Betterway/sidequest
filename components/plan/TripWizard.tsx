"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Chips, Field, inputClass, ListInput, NumberInput, Segmented, TextArea, Toggle } from "@/components/ui/fields";
import { saveInputs } from "@/lib/data/plan";
import {
  FT_PER_M,
  INTERESTS,
  LODGING,
  MI_PER_KM,
  MilestoneSchema,
  TRANSPORT_MODES,
  VehicleSchema,
  type Milestone,
  type TripInputs,
} from "@/lib/model/inputs";
import type { Trip } from "@/lib/model/trip";

const STEPS = ["When and where", "Must-dos", "Getting around", "What you're into", "The rest"] as const;

/**
 * Everything Sidequest needs to draft good options, in five short steps.
 * Saves on every step (works offline), so closing halfway loses nothing.
 */
export default function TripWizard({
  trip,
  initial,
  onClose,
}: {
  trip: Trip;
  initial: TripInputs;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [inputs, setInputs] = useState<TripInputs>(() => withDefaultTravelers(initial));
  const [startDate, setStartDate] = useState(trip.startDate ?? "");
  const [endDate, setEndDate] = useState(trip.endDate ?? "");
  const set = <K extends keyof TripInputs>(key: K, value: TripInputs[K]) => setInputs((p) => ({ ...p, [key]: value }));

  function save() {
    saveInputs(trip.id, inputs, { startDate: startDate || null, endDate: endDate || null });
  }
  function go(next: number) {
    save();
    if (next >= STEPS.length) onClose();
    else setStep(next);
  }
  function close() {
    save();
    onClose();
  }

  const metric = inputs.units === "metric";

  return (
    <Sheet title={`${step + 1} of ${STEPS.length}: ${STEPS[step]}`} onClose={close}>
      <div className="space-y-5 pb-2">
        {step === 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
              </Field>
              <Field label="End">
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <NumberInput
              label="Flexible by (days)"
              hint="How much the dates can shift if it makes the trip better."
              value={inputs.flexibleDays}
              onChange={(v) => set("flexibleDays", Math.max(0, Math.min(14, v ?? 0)))}
            />
            <ListInput
              label="Regions or places"
              values={inputs.regions}
              onChange={(v) => set("regions", v)}
              placeholder="Southern Utah, the Oregon coast..."
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starting from">
                <input value={inputs.startPlace} onChange={(e) => set("startPlace", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Ending at">
                <input value={inputs.endPlace} onChange={(e) => set("endPlace", e.target.value)} className={inputClass} />
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <MilestonesEditor milestones={inputs.milestones} onChange={(m) => set("milestones", m)} />
            <TextArea label="Must-dos" value={inputs.mustDos} onChange={(v) => set("mustDos", v)} placeholder="Things that have to happen" />
            <TextArea
              label="Already booked"
              hint="Fixed things the plan should work around."
              value={inputs.alreadyBooked}
              onChange={(v) => set("alreadyBooked", v)}
              placeholder="Campsite near the park, nights 3 and 4"
            />
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <span className="text-sm font-medium">Allowed ways to get around</span>
              <div className="mt-2">
                <Chips label="Transport" options={TRANSPORT_MODES} selected={inputs.modes} onChange={(m) => set("modes", m)} />
              </div>
            </div>
            {(inputs.modes.includes("campervan") || inputs.modes.includes("car")) && (
              <VehicleEditor metric={metric} inputs={inputs} set={set} />
            )}
            <NumberInput
              label="Max driving per day (hours)"
              value={inputs.maxDriveHoursPerDay}
              onChange={(v) => set("maxDriveHoursPerDay", v === null ? null : Math.max(1, Math.min(14, v)))}
              step={0.5}
            />
            <Toggle label="No driving after dark" checked={inputs.noNightDriving} onChange={(v) => set("noNightDriving", v)} />
            <NumberInput
              label="Minimum nights per stop"
              hint="2 or more means fewer pack-up mornings."
              value={inputs.minNightsPerStop}
              onChange={(v) => set("minNightsPerStop", Math.max(1, Math.min(7, v ?? 1)))}
            />
          </>
        )}

        {step === 3 && (
          <>
            {inputs.travelers.map((t, i) => (
              <section key={i} className="space-y-3 rounded-2xl border border-border p-4">
                <Field label="Name in the app">
                  <input
                    value={t.label}
                    onChange={(e) => set("travelers", inputs.travelers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    className={inputClass}
                  />
                </Field>
                <Chips
                  label={`Interests for ${t.label || "traveler"}`}
                  options={INTERESTS}
                  selected={t.interests.filter((x): x is (typeof INTERESTS)[number] => (INTERESTS as readonly string[]).includes(x))}
                  onChange={(next) =>
                    set(
                      "travelers",
                      inputs.travelers.map((x, j) =>
                        j === i ? { ...x, interests: [...next, ...x.interests.filter((y) => !(INTERESTS as readonly string[]).includes(y))] } : x
                      )
                    )
                  }
                />
                <TextArea
                  label="Anything specific"
                  value={t.notes}
                  onChange={(v) => set("travelers", inputs.travelers.map((x, j) => (j === i ? { ...x, notes: v } : x)))}
                  placeholder="Climbs 5.10, max 15 km hikes, vegetarian, coffee snob"
                />
              </section>
            ))}
            <TextArea label="Photo goals" value={inputs.photoGoals} onChange={(v) => set("photoGoals", v)} placeholder="Golden hour, dark skies, wildlife" />
          </>
        )}

        {step === 4 && (
          <>
            <Field label="Budget">
              <div className="mt-1">
                <Segmented label="Budget" options={["shoestring", "comfortable", "splurge"] as const} value={inputs.budget} onChange={(v) => set("budget", v)} />
              </div>
            </Field>
            <div>
              <span className="text-sm font-medium">Where you like to sleep</span>
              <div className="mt-2">
                <Chips label="Lodging" options={LODGING} selected={inputs.lodging} onChange={(v) => set("lodging", v)} />
              </div>
            </div>
            <Field label="Mornings">
              <div className="mt-1">
                <Segmented label="Mornings" options={["sunrise", "normal", "sleep in"] as const} value={inputs.wakeStyle} onChange={(v) => set("wakeStyle", v)} />
              </div>
            </Field>
            <NumberInput
              label="A rest day every ... days"
              hint="0 for none. Good for laundry and recovery."
              value={inputs.restEveryNDays}
              onChange={(v) => set("restEveryNDays", Math.max(0, Math.min(14, v ?? 0)))}
            />
            <TextArea label="Remote work" value={inputs.workDays} onChange={(v) => set("workDays", v)} placeholder="Need good signal Tue and Thu mornings" />
            <TextArea label="Hard nos" value={inputs.hardNos} onChange={(v) => set("hardNos", v)} placeholder="Big crowds, heat over 95°F, big cities" />
            <TextArea label="Weather preference" value={inputs.weather} onChange={(v) => set("weather", v)} placeholder="Chase the sun, fine with cold nights" />
            <Toggle label="Surprise me with one wildcard" checked={inputs.surpriseMe} onChange={(v) => set("surpriseMe", v)} />
            <Field label="Units">
              <div className="mt-1">
                <Segmented label="Units" options={["imperial", "metric"] as const} value={inputs.units} onChange={(v) => set("units", v)} />
              </div>
            </Field>
            <Field label="Home currency" hint="Three letters, like USD or CAD.">
              <input
                value={inputs.homeCurrency}
                maxLength={3}
                onChange={(e) => set("homeCurrency", e.target.value.toUpperCase())}
                className={inputClass}
              />
            </Field>
            <TextArea label="Anything else" value={inputs.extraNotes} onChange={(v) => set("extraNotes", v)} />
          </>
        )}

        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <button type="button" onClick={() => go(step - 1)} className="min-h-12 flex-1 rounded-xl border border-border font-medium">
              Back
            </button>
          )}
          <button type="button" onClick={() => go(step + 1)} className="min-h-12 flex-[2] rounded-xl bg-accent font-semibold text-on-accent">
            {step === STEPS.length - 1 ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function withDefaultTravelers(inputs: TripInputs): TripInputs {
  if (inputs.travelers.length) return inputs;
  return {
    ...inputs,
    travelers: [
      { label: "You", interests: [], notes: "" },
      { label: "Travel partner", interests: [], notes: "" },
    ],
  };
}

function VehicleEditor({
  metric,
  inputs,
  set,
}: {
  metric: boolean;
  inputs: TripInputs;
  set: <K extends keyof TripInputs>(key: K, value: TripInputs[K]) => void;
}) {
  const v = inputs.vehicle ?? VehicleSchema.parse({});
  const update = (patch: Partial<typeof v>) => set("vehicle", { ...v, ...patch });
  // Stored in meters and km; shown in the trip's units.
  const len = (m: number | null) => (m === null ? null : Math.round((metric ? m : m * FT_PER_M) * 10) / 10);
  const fromLen = (x: number | null) => (x === null ? null : metric ? x : x / FT_PER_M);
  const dist = (km: number | null) => (km === null ? null : Math.round(metric ? km : km * MI_PER_KM));
  const fromDist = (x: number | null) => (x === null ? null : metric ? x : x / MI_PER_KM);
  const unit = metric ? "m" : "ft";

  return (
    <section className="space-y-3 rounded-2xl border border-border p-4">
      <p className="text-sm font-semibold">Your vehicle</p>
      <p className="text-xs text-muted">Used to steer around low clearances, length limits, and long gaps between fuel and water.</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label={`Length (${unit})`} value={len(v.lengthM)} onChange={(x) => update({ lengthM: fromLen(x) })} step={0.1} />
        <NumberInput label={`Height (${unit})`} value={len(v.heightM)} onChange={(x) => update({ heightM: fromLen(x) })} step={0.1} />
        <NumberInput label={`Range (${metric ? "km" : "mi"})`} value={dist(v.rangeKm)} onChange={(x) => update({ rangeKm: fromDist(x) })} />
        <NumberInput
          label="Off-grid nights"
          value={v.offGridNights}
          onChange={(x) => update({ offGridNights: x === null ? null : Math.max(0, Math.min(30, Math.round(x))) })}
        />
      </div>
      <Toggle label="4WD / AWD" checked={v.fourWheelDrive} onChange={(x) => update({ fourWheelDrive: x })} />
      <TextArea label="Vehicle notes" value={v.notes} onChange={(x) => update({ notes: x })} placeholder="Pop-top, no bathroom, solar" />
    </section>
  );
}

const KINDS = MilestoneSchema.shape.kind.options;

function MilestonesEditor({ milestones, onChange }: { milestones: Milestone[]; onChange: (m: Milestone[]) => void }) {
  const [draft, setDraft] = useState<Milestone | null>(null);

  function startNew() {
    setDraft({
      id: `m_${Date.now().toString(36)}`,
      title: "",
      kind: "other",
      date: "",
      endDate: null,
      time: null,
      place: "",
      priority: "required",
      bufferBeforeDays: 0,
      bufferAfterDays: 0,
      notes: "",
    });
  }

  return (
    <div className="space-y-3">
      <span className="text-sm font-medium">Milestones</span>
      <p className="text-xs text-muted">A wedding, a conference, a show. Required ones are locked into every option.</p>
      {milestones.map((m) => (
        <div key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
          <div>
            <p className="font-medium">{m.title}</p>
            <p className="text-xs text-muted">
              {m.date}
              {m.time ? ` at ${m.time}` : ""}
              {m.place ? ` · ${m.place}` : ""} · {m.priority}
            </p>
          </div>
          <button type="button" onClick={() => onChange(milestones.filter((x) => x.id !== m.id))} className="min-h-11 text-sm text-muted underline">
            Remove
          </button>
        </div>
      ))}

      {draft ? (
        <div className="space-y-3 rounded-xl border border-accent/50 p-3">
          <Field label="What">
            <input
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Friends' wedding"
              className={inputClass}
            />
          </Field>
          <Field label="Kind">
            <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Milestone["kind"] })} className={`${inputClass} capitalize`}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Time">
              <input type="time" value={draft.time ?? ""} onChange={(e) => setDraft({ ...draft, time: e.target.value || null })} className={inputClass} />
            </Field>
          </div>
          <Field label="Where">
            <input value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} className={inputClass} />
          </Field>
          <Segmented label="Priority" options={["required", "preferred"] as const} value={draft.priority} onChange={(p) => setDraft({ ...draft, priority: p })} />
          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              label="Arrive days early"
              value={draft.bufferBeforeDays}
              onChange={(x) => setDraft({ ...draft, bufferBeforeDays: Math.max(0, Math.min(5, x ?? 0)) })}
            />
            <NumberInput
              label="Easy days after"
              value={draft.bufferAfterDays}
              onChange={(x) => setDraft({ ...draft, bufferAfterDays: Math.max(0, Math.min(5, x ?? 0)) })}
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setDraft(null)} className="min-h-11 flex-1 rounded-xl border border-border">
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft.date || !draft.title.trim()}
              onClick={() => {
                onChange([...milestones, { ...draft, title: draft.title.trim() }]);
                setDraft(null);
              }}
              className="min-h-11 flex-[2] rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
            >
              Add milestone
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={startNew} className="min-h-12 w-full rounded-xl border-2 border-dashed border-border font-medium text-muted">
          + Add a milestone
        </button>
      )}
    </div>
  );
}
