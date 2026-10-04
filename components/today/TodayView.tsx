"use client";

import { useEffect, useMemo, useState } from "react";
import { useOnline } from "@/components/shell/useOnline";
import { useNow } from "@/components/shell/useNow";
import { usePlan, type PlanState } from "@/components/plan/usePlan";
import { useNotes } from "@/components/notes/useNotes";
import { useHistory } from "@/components/plan/useHistory";
import ChangesCard from "@/components/plan/ChangesCard";
import QuestionsPanel from "@/components/plan/QuestionsPanel";
import CaptureSheet, { dayChoices } from "@/components/notes/CaptureSheet";
import DriveLegCard from "@/components/van/DriveLegCard";
import VanSheet from "@/components/van/VanSheet";
import { callAi, todayIso } from "@/lib/ai/client";
import { watchNearby } from "@/lib/data/van";
import { sunTimes } from "@/lib/grounding/sun";
import { readInputs, type TripInputs } from "@/lib/model/inputs";
import type { Note } from "@/lib/model/note";
import { placeKey, tempIn, type Holiday, type WeatherDay } from "@/lib/model/place";
import { formatTime, sortItems, toMinutes, type StoredItem } from "@/lib/model/plan";
import { formatTripDates, type Trip } from "@/lib/model/trip";
import { estimateLeg, formatDistance, formatHours, legsFor, type NearbySpots, type SpotKind } from "@/lib/model/van";
import { daysBetween, nowAndNext, tripPhase, untilText } from "@/lib/plan/today";

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * The home screen while you're traveling: today's stop, what's on now and
 * next, light and weather, the drive, and where to sleep and restock. Before
 * and after the trip it's a countdown or a wrap-up, plus what changed.
 */
export default function TodayView({
  trip,
  email,
  onOpenDay,
  onPlan,
}: {
  trip: Trip;
  email: string;
  onOpenDay: (date: string) => void;
  onPlan: () => void;
}) {
  const plan = usePlan(trip.id);
  const { notes } = useNotes(trip.id);
  const history = useHistory(trip.id);
  const inputs = readInputs(trip.inputs);
  const now = useNow(30_000);
  const [today] = useState(() => todayIso());
  const phase = tripPhase(trip, today);
  const changes = <ChangesCard trip={trip} email={email} plan={plan} notes={notes} history={history} />;

  if (!plan.loaded) return <p className="py-6 text-center text-sm text-muted">Loading...</p>;

  if (plan.days.length === 0 || phase === "undated") {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Nothing planned yet</h2>
          <p className="mt-2 text-sm text-muted">
            Once the trip has dates and a plan, this is where today lives: what&apos;s next, the light, the weather, and the drive.
          </p>
          <button type="button" onClick={onPlan} className="mt-3 min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent">
            Go to the plan
          </button>
        </section>
        {changes}
      </div>
    );
  }

  if (phase === "before") {
    const first = plan.days[0];
    const n = daysBetween(today, trip.startDate!);
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
          <h2 className="mt-1 text-2xl font-bold">{n === 1 ? "Starts tomorrow" : `Starts in ${n} days`}</h2>
          <p className="mt-1 text-sm text-muted">
            Day 1 is {longDate(first.date)} in {first.base}: {first.title}.
          </p>
          <button type="button" onClick={() => onOpenDay(first.date)} className="mt-3 min-h-12 w-full rounded-xl border border-border font-semibold">
            Open day 1
          </button>
        </section>
        {changes}
      </div>
    );
  }

  if (phase === "after") {
    const stops = new Set(plan.days.map((d) => d.base)).size;
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-2xl font-bold">That&apos;s a wrap</h2>
          <p className="mt-1 text-sm text-muted">
            {plan.days.length} days, {stops} {stops === 1 ? "stop" : "stops"}. Start the next one from the trip name at the top.
          </p>
        </section>
        {changes}
      </div>
    );
  }

  return (
    <During trip={trip} email={email} plan={plan} inputs={inputs} today={today} now={now} changes={changes} notes={notes} onOpenDay={onOpenDay} />
  );
}

function During({
  trip,
  email,
  plan,
  inputs,
  today,
  now,
  changes,
  notes,
  onOpenDay,
}: {
  trip: Trip;
  email: string;
  plan: PlanState;
  inputs: TripInputs;
  today: string;
  now: number;
  changes: React.ReactNode;
  notes: Note[];
  onOpenDay: (date: string) => void;
}) {
  const units = inputs.units;
  const index = plan.days.findIndex((d) => d.date === today);
  const day = plan.days[index];
  const [capturing, setCapturing] = useState(false);
  const [vanOpen, setVanOpen] = useState(false);
  const items = useMemo(() => sortItems(plan.items.filter((i) => i.dayDate === today)), [plan.items, today]);

  if (!day) {
    return <p className="py-6 text-center text-sm text-muted">Today isn&apos;t on the plan. Check the trip dates in Trip details.</p>;
  }

  const clock = new Date(now);
  const nowMin = clock.getHours() * 60 + clock.getMinutes();
  const { current, next, later, anytime } = nowAndNext(items, nowMin);
  const sun = day.place ? sunTimes(day.date, day.place.lat, day.place.lng, day.place.timezone) : null;
  const sunsetMin = sun?.sunset ? toMinutes(sun.sunset) : null;
  const beforeSunset = sunsetMin !== null && nowMin < sunsetMin;
  const van = inputs.modes.includes("campervan");
  const drives = van || inputs.modes.includes("car");
  const legIn = drives
    ? legsFor(plan.days.map((d) => ({ date: d.date, base: d.base, place: d.place }))).find((l) => l.date === today)
    : undefined;
  const tomorrow = plan.days[index + 1];
  const moving = tomorrow && tomorrow.base !== day.base ? tomorrow : null;
  const moveLeg = moving && day.place && moving.place ? estimateLeg(day.place, moving.place) : null;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Day {index + 1} of {plan.days.length} · {longDate(day.date)}
        </p>
        <h2 className="mt-0.5 text-xl font-bold">{day.title}</h2>
        <p className="text-sm text-muted">{day.base}</p>
        <TodayWeather tripId={trip.id} day={day} today={today} units={units} />
        {sun && (
          <p className="mt-1 text-sm">
            {beforeSunset && sunsetMin !== null
              ? `Sunset ${formatTime(sun.sunset, units)}, ${untilText(sunsetMin - nowMin)}`
              : `Sunrise tomorrow around ${formatTime(sun.sunrise, units)}`}
            {beforeSunset && sun.goldenEvening ? ` · golden hour from ${formatTime(sun.goldenEvening, units)}` : ""}
          </p>
        )}
      </section>

      {changes}

      <section aria-label="Now and next" className="rounded-2xl border border-border bg-surface p-4">
        {current && <ItemLine label="Now" item={current} extra={current.end ? `until ${formatTime(current.end, units)}` : "now"} />}
        {next ? (
          <ItemLine label="Next" item={next} extra={`${formatTime(next.start, units)}, ${untilText(toMinutes(next.start)! - nowMin)}`} />
        ) : (
          !current && <p className="text-sm text-muted">Nothing else with a set time today.</p>
        )}
        {later.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            {later.map((i) => (
              <li key={i.id}>
                <span className="text-muted">{formatTime(i.start, units)}</span> {i.title}
              </li>
            ))}
          </ul>
        )}
        {anytime.length > 0 && <p className="mt-2 text-xs text-muted">Any time: {anytime.map((i) => i.title).join(" · ")}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onOpenDay(today)} className="min-h-11 rounded-xl border border-border text-sm font-medium">
            Open today
          </button>
          <button type="button" onClick={() => setCapturing(true)} className="min-h-11 rounded-xl border border-border text-sm font-medium">
            Jot a tip
          </button>
        </div>
      </section>

      {legIn && <DriveLegCard key={`today-${legIn.date}`} tripId={trip.id} from={legIn.from} to={legIn.to} inputs={inputs} />}
      {moving && (
        <p className="rounded-xl bg-surface-2 p-3 text-sm">
          Tomorrow you move to <span className="font-semibold">{moving.base}</span>
          {moveLeg ? `: about ${formatHours(moveLeg.hours)}, ${formatDistance(moveLeg.km, units)}.` : "."}
        </p>
      )}

      {van && day.place && <Restock tripId={trip.id} base={day.base} units={units} onOpen={() => setVanOpen(true)} />}

      <QuestionsPanel key={today} trip={trip} inputs={inputs} plan={plan} notes={notes} email={email} dayDate={today} />

      {capturing && (
        <CaptureSheet
          tripId={trip.id}
          email={email}
          kinds={["tip", "note", "flyer"]}
          initialKind="tip"
          days={dayChoices(plan.days)}
          initialDay={today}
          onClose={() => setCapturing(false)}
        />
      )}
      {vanOpen && day.place && (
        <VanSheet
          tripId={trip.id}
          inputs={inputs}
          place={{ name: day.base, lat: day.place.lat, lng: day.place.lng, countryCode: day.place.countryCode ?? null }}
          onClose={() => setVanOpen(false)}
        />
      )}
    </div>
  );
}

function ItemLine({ label, item, extra }: { label: string; item: StoredItem; extra: string }) {
  return (
    <div className="mb-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">{label}</p>
      <p className="font-semibold">{item.title}</p>
      <p className="text-sm text-muted">
        {extra}
        {item.place ? ` · ${item.place}` : ""}
      </p>
      {item.notes && <p className="text-sm text-muted">{item.notes}</p>}
    </div>
  );
}

type TodayFacts = { weather: WeatherDay | null; holiday: Holiday | null };

/** Today's forecast and any public holiday, fetched once a day per stop and kept on this phone. */
function TodayWeather({
  tripId,
  day,
  today,
  units,
}: {
  tripId: string;
  day: PlanState["days"][number];
  today: string;
  units: "imperial" | "metric";
}) {
  const online = useOnline();
  const key = `sidequest_today_${tripId}_${today}_${placeKey(day.base)}`;
  const [facts, setFacts] = useState<TodayFacts | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as TodayFacts) : null;
    } catch {
      return null;
    }
  });
  const place = day.place;

  useEffect(() => {
    if (facts || !online || !place) return;
    let live = true;
    void callAi<{ weather: { days: WeatherDay[] } | null; holidays: Holiday[] }>("/api/place/facts", {
      place: { name: day.base, lat: place.lat, lng: place.lng, countryCode: place.countryCode ?? null },
      from: today,
      to: today,
      today,
    }).then((res) => {
      if (!res.ok || !live) return;
      const got: TodayFacts = {
        weather: res.data.weather?.days.find((w) => w.date === today) ?? null,
        holiday: res.data.holidays.find((h) => h.date === today) ?? null,
      };
      setFacts(got);
      try {
        localStorage.setItem(key, JSON.stringify(got));
      } catch {
        // fine: it fetches again next time
      }
    });
    return () => {
      live = false;
    };
  }, [facts, online, place, day.base, today, key]);

  if (!facts) return null;
  const w = facts.weather;
  return (
    <>
      {w && (
        <p className="mt-2 text-sm">
          {w.label} · {tempIn(w.high, units)} / {tempIn(w.low, units)}
          {w.rain !== null ? ` · ${w.rainUnit === "%" ? `${w.rain}% rain` : `${w.rain} mm rain`}` : ""}
        </p>
      )}
      {facts.holiday && <p className="mt-1 text-sm text-warn">Public holiday: {facts.holiday.name}. Some places may close.</p>}
    </>
  );
}

const SPOT_LABEL: Record<SpotKind, string> = { camp: "Sleep", water: "Water", dump: "Dump" };

/** The nearest of each, from the saved "sleep and restock" lookup for tonight's stop. */
function Restock({ tripId, base, units, onOpen }: { tripId: string; base: string; units: "imperial" | "metric"; onOpen: () => void }) {
  const [saved, setSaved] = useState<NearbySpots | null>(null);
  useEffect(() => watchNearby(tripId, `near-${placeKey(base)}`, setSaved), [tripId, base]);
  const nearest = (["camp", "water", "dump"] as const)
    .map((k) => saved?.spots.find((s) => s.kind === k))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <section aria-label="Sleep and restock" className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Sleep and restock</h2>
      {nearest.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm">
          {nearest.map((s) => (
            <li key={s.id}>
              <span className="text-muted">{SPOT_LABEL[s.kind]}:</span> {s.name} · {formatDistance(s.km, units)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">Campsites, water, and dump stations near {base}.</p>
      )}
      <button type="button" onClick={onOpen} className="mt-2 min-h-11 text-sm font-medium text-accent">
        {nearest.length ? "See all nearby ›" : "Find them ›"}
      </button>
    </section>
  );
}
