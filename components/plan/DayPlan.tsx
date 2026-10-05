"use client";

import { useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Field, inputClass, TextArea } from "@/components/ui/fields";
import { addItem, deleteItem, swapOrder, updateItem } from "@/lib/data/plan";
import { sunTimes } from "@/lib/grounding/sun";
import { formatTime, ITEM_KINDS, sortItems, type ItemKind, type StoredDay, type StoredItem } from "@/lib/model/plan";
import type { TripInputs } from "@/lib/model/inputs";
import type { Trip } from "@/lib/model/trip";
import type { PlanState } from "./usePlan";
import DayTuner from "./DayTuner";
import { stayRange } from "@/lib/plan/schedule";
import PlaceSheet, { type PlaceTarget } from "@/components/place/PlaceSheet";
import CaptureSheet, { dayChoices } from "@/components/notes/CaptureSheet";
import DriveLegCard from "@/components/van/DriveLegCard";
import VanSheet from "@/components/van/VanSheet";
import { legsFor } from "@/lib/model/van";
import QuestionsPanel from "./QuestionsPanel";
import { offerUndo } from "./undo";
import SpeakButton from "@/components/voice/SpeakButton";
import { dayScript } from "@/lib/plan/readAloud";
import type { ChangeDraft } from "@/lib/model/draft";
import type { Note } from "@/lib/model/note";

const KIND_ICON: Record<ItemKind, string> = {
  activity: "●",
  meal: "◆",
  drive: "▸",
  sleep: "☾",
  milestone: "★",
  free: "○",
  errand: "■",
};

function dayLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    day: d.getUTCDate(),
    long: d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

/** The day-by-day plan: pick a day, see its timeline, lock or edit anything. */
export default function DayPlan({
  trip,
  inputs,
  plan,
  email,
  notes,
  drafts,
  selected: selectedProp,
  onSelect,
  onChangeDay,
}: {
  trip: Trip;
  inputs: TripInputs;
  plan: PlanState;
  email: string;
  notes: Note[];
  drafts: ChangeDraft[];
  /** The open day, kept by the parent so the itinerary can open a day. Null: today if it's on the trip, else day 1. */
  selected: string | null;
  onSelect: (date: string) => void;
  onChangeDay: (date: string) => void;
}) {
  const tripId = trip.id;
  const units = inputs.units;
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const selected = selectedProp ?? (plan.days.some((d) => d.date === today) ? today : plan.days[0]?.date);
  const setSelected = onSelect;
  const [editing, setEditing] = useState<StoredItem | "new" | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [vanOpen, setVanOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState<{ target: PlaceTarget; from: string; to: string } | null>(null);

  const day = plan.days.find((d) => d.date === selected) ?? plan.days[0];
  const items = useMemo(
    () => (day ? sortItems(plan.items.filter((i) => i.dayDate === day.date)) : []),
    [plan.items, day]
  );
  const sun = day?.place ? sunTimes(day.date, day.place.lat, day.place.lng, day.place.timezone) : null;

  if (!day) return null;
  const label = dayLabel(day.date);
  const van = inputs.modes.includes("campervan");
  const drives = van || inputs.modes.includes("car");
  const dayDrafts = drafts.filter((d) => d.dayDate === day.date).length;
  const leg = drives
    ? legsFor(plan.days.map((d) => ({ date: d.date, base: d.base, place: d.place }))).find((l) => l.date === day.date)
    : undefined;

  return (
    <div className="space-y-4">
      <nav aria-label="Days" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {plan.days.map((d, i) => {
          const l = dayLabel(d.date);
          const on = d.date === day.date;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelected(d.date)}
              aria-current={on ? "date" : undefined}
              aria-label={`Day ${i + 1}, ${l.long}`}
              className={`flex min-h-16 min-w-14 shrink-0 flex-col items-center justify-center rounded-2xl border ${
                on ? "border-accent bg-accent text-on-accent" : "border-border bg-surface"
              }`}
            >
              <span className="text-[11px] font-medium opacity-80">{l.weekday}</span>
              <span className="text-lg font-bold leading-tight">{l.day}</span>
            </button>
          );
        })}
      </nav>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label.long}</p>
        <h2 className="mt-0.5 text-lg font-bold">{day.title}</h2>
        <SpeakButton text={dayScript(day.title, day.base, items, units)} label="Read this day aloud" />
        <button
          type="button"
          onClick={() => {
            const stay = stayRange(plan.days, day.date);
            setPlaceOpen({ target: targetFromDay(day), from: stay.from, to: stay.to });
          }}
          className="min-h-11 text-left text-sm font-medium text-accent"
        >
          About {day.base} ›
        </button>
        {van && day.place && (
          <button type="button" onClick={() => setVanOpen(true)} className="block min-h-11 text-left text-sm font-medium text-accent">
            Sleep and restock nearby ›
          </button>
        )}
        {leg && <DriveLegCard key={`drive-${leg.date}`} tripId={tripId} from={leg.from} to={leg.to} inputs={inputs} />}
        {sun ? (
          <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-xs" aria-label="Sun times">
            {[
              ["Sunrise", sun.sunrise],
              ["Golden", sun.goldenEvening],
              ["Sunset", sun.sunset],
              ["Dusk", sun.dusk],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface-2 py-2">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold">{v ? formatTime(v, units) : "None"}</dd>
              </div>
            ))}
            <p className="col-span-4 text-left text-[11px] text-muted">
              {sun.moonLabel} · local time at {day.place?.name}
            </p>
          </dl>
        ) : (
          <p className="mt-2 text-xs text-muted">Sun times appear once this stop has a location.</p>
        )}
        <DayTuner
          key={day.date}
          trip={trip}
          inputs={inputs}
          day={day}
          dayItems={items}
          proposals={plan.proposals}
          email={email}
        />
      </section>

      <ol className="space-y-2">
        {items.map((it, i) => (
          <li key={it.id} className="rounded-2xl border border-border bg-surface p-3">
            <div className="flex items-start gap-3">
              <span aria-hidden className={`mt-0.5 w-4 text-center ${it.kind === "milestone" ? "text-accent" : "text-muted"}`}>
                {KIND_ICON[it.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => setEditing(it)} className="w-full text-left">
                  <p className="text-xs text-muted">
                    {it.start ? formatTime(it.start, units) : "Any time"}
                    {it.end ? ` to ${formatTime(it.end, units)}` : ""}
                    {it.pending && <span className="ml-2 text-warn">waiting to sync</span>}
                  </p>
                  <p className="font-medium">{it.title}</p>
                  {it.place && <p className="text-xs text-muted">{it.place}</p>}
                  {it.notes && <p className="mt-1 text-sm text-muted">{it.notes}</p>}
                </button>
                {it.place && it.kind !== "drive" && (
                  <button
                    type="button"
                    aria-label={`Details for ${it.title}`}
                    onClick={() =>
                      setPlaceOpen({
                        // Look the spot up near where you're staying that day.
                        target: { ...targetFromDay(day), name: it.place! },
                        from: day.date,
                        to: day.date,
                      })
                    }
                    className="mt-1 min-h-9 text-xs font-medium text-accent"
                  >
                    Details and hours ›
                  </button>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-center">
                <button
                  type="button"
                  aria-label={it.locked ? `Unlock ${it.title}` : `Lock ${it.title}`}
                  aria-pressed={it.locked}
                  onClick={() => updateItem(tripId, it.id, { locked: !it.locked }, email)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full ${it.locked ? "bg-accent-soft text-accent" : "text-muted"}`}
                >
                  <LockIcon locked={it.locked} />
                </button>
                <div className="flex">
                  <button
                    type="button"
                    aria-label={`Move ${it.title} earlier`}
                    disabled={i === 0}
                    onClick={() => swapOrder(tripId, it, items[i - 1], email)}
                    className="h-9 w-8 text-sm text-muted disabled:opacity-25"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${it.title} later`}
                    disabled={i === items.length - 1}
                    onClick={() => swapOrder(tripId, it, items[i + 1], email)}
                    className="h-9 w-8 text-sm text-muted disabled:opacity-25"
                  >
                    ↓
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => setEditing("new")}
        className="min-h-12 w-full rounded-2xl border-2 border-dashed border-border font-medium text-muted"
      >
        + Add to this day
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChangeDay(day.date)} className="min-h-11 rounded-xl border border-border text-sm font-medium text-accent">
          {dayDrafts ? `Change this day (${dayDrafts} draft${dayDrafts === 1 ? "" : "s"})` : "Change this day"}
        </button>
        <button type="button" onClick={() => setCapturing(true)} className="min-h-11 rounded-xl border border-border text-sm font-medium text-accent">
          Jot a tip or note
        </button>
      </div>
      <p className="text-center text-xs text-muted">Locked items stay put when you re-plan. Milestones start locked.</p>

      <QuestionsPanel key={day.date} trip={trip} inputs={inputs} plan={plan} notes={notes} email={email} dayDate={day.date} />

      {vanOpen && day.place && (
        <VanSheet
          tripId={tripId}
          inputs={inputs}
          place={{ name: day.base, lat: day.place.lat, lng: day.place.lng, countryCode: day.place.countryCode ?? null }}
          onClose={() => setVanOpen(false)}
        />
      )}

      {capturing && (
        <CaptureSheet
          tripId={tripId}
          email={email}
          kinds={["tip", "note"]}
          initialKind="tip"
          days={dayChoices(plan.days)}
          initialDay={day.date}
          onClose={() => setCapturing(false)}
        />
      )}

      {placeOpen && (
        <PlaceSheet
          trip={trip}
          inputs={inputs}
          target={placeOpen.target}
          from={placeOpen.from}
          to={placeOpen.to}
          email={email}
          onClose={() => setPlaceOpen(null)}
        />
      )}

      {editing && (
        <ItemEditor
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            if (editing === "new") {
              const order = items.reduce((m, x) => Math.max(m, x.order), -1) + 1;
              addItem(tripId, day.date, draft, order, email);
            } else {
              updateItem(tripId, editing.id, draft, email);
            }
            setEditing(null);
          }}
          onDelete={
            editing === "new"
              ? undefined
              : () => {
                  offerUndo(tripId, deleteItem(tripId, editing, email), email);
                  setEditing(null);
                }
          }
        />
      )}
    </div>
  );
}

/** Where a day's stop is, for looking things up near it. */
function targetFromDay(day: StoredDay): PlaceTarget {
  return {
    name: day.base,
    lat: day.place?.lat ?? null,
    lng: day.place?.lng ?? null,
    timezone: day.place?.timezone ?? null,
    countryCode: day.place?.countryCode ?? null,
  };
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      {locked ? <path d="M8 11V8a4 4 0 0 1 8 0v3" /> : <path d="M8 11V8a4 4 0 0 1 7.5-2" />}
    </svg>
  );
}

function ItemEditor({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: StoredItem | null;
  onClose: () => void;
  onSave: (draft: { kind: ItemKind; title: string; start: string | null; end: string | null; place: string | null; notes: string }) => void;
  onDelete?: () => void;
}) {
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? "activity");
  const [title, setTitle] = useState(item?.title ?? "");
  const [start, setStart] = useState(item?.start ?? "");
  const [end, setEnd] = useState(item?.end ?? "");
  const [place, setPlace] = useState(item?.place ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");

  return (
    <Sheet title={item ? "Edit" : "Add to this day"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onSave({ kind, title: title.trim(), start: start || null, end: end || null, place: place.trim() || null, notes: notes.trim() });
        }}
      >
        <Field label="What">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Kind">
          <select value={kind} onChange={(e) => setKind(e.target.value as ItemKind)} className={`${inputClass} capitalize`}>
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </Field>
          <Field label="End">
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Where">
          <input value={place} onChange={(e) => setPlace(e.target.value)} className={inputClass} />
        </Field>
        <TextArea label="Notes" value={notes} onChange={setNotes} />
        <button type="submit" disabled={!title.trim()} className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50">
          Save
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="min-h-11 w-full text-sm text-warn underline">
            Remove from the plan
          </button>
        )}
      </form>
    </Sheet>
  );
}
