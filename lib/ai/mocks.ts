import { dayCount, type TripInputs } from "@/lib/model/inputs";
import type { DayDraft, PlanItemDraft, TripOption } from "@/lib/model/plan";
import type { Holiday, HoursResult, PlaceInfo, Source, WeatherDay, WikiSummary } from "@/lib/model/place";

/**
 * Stand-in AI answers for tests and local dev (AI_MOCK=1). Deterministic and
 * shaped like the real thing, so the whole flow can run without a Claude key
 * and without spending anything.
 */

export function mockOptions(trip: { startDate: string; endDate: string }, inputs: TripInputs): TripOption[] {
  const nights = dayCount(trip.startDate, trip.endDate) - 1;
  const places = inputs.regions.length ? inputs.regions : [inputs.startPlace || "Somewhere scenic"];
  const flavors = [
    { title: "The scenic loop", pace: "balanced" as const, differsBy: "Spreads time evenly across every region." },
    { title: "Slow and deep", pace: "chill" as const, differsBy: "Fewer stops, longer stays, lots of open time." },
    { title: "Big-day sampler", pace: "packed" as const, differsBy: "More stops and bigger days to see the most." },
  ];
  return flavors.map((f, i) => {
    const stops = i === 1 ? places.slice(0, Math.max(1, Math.ceil(places.length / 2))) : places;
    const per = Math.floor(nights / stops.length);
    const extra = nights - per * stops.length;
    return {
      title: f.title,
      pitch: `A ${f.pace} take on ${places.join(" and ")}. Built from your interests.`,
      differsBy: f.differsBy,
      route: stops.map((p, j) => ({
        place: i === 2 && j === 0 ? `${p} (north side)` : p,
        nights: per + (j < extra ? 1 : 0),
        why: "Fits what you're into",
      })),
      highlights: ["Sunset from a high point", "A long lunch somewhere local", "One big outdoor day"],
      tradeoffs: [i === 2 ? "Long drive days" : "Some popular spots may be busy"],
      milestoneFit: inputs.milestones.length ? "Milestones are on their dates." : "No milestones",
      estDriveHours: 6 + i * 4,
      pace: f.pace,
    };
  });
}

export function mockDays(dates: { date: string; stop: string }[]): DayDraft[] {
  return dates.map(({ date, stop }, i) => ({
    date,
    base: stop,
    title: i === 0 ? "Arrive and settle in" : `Exploring ${stop}`,
    items: [
      { kind: "activity", title: `Morning walk around ${stop}`, start: "08:30", end: "10:00", place: stop, notes: "" },
      { kind: "meal", title: "Lunch at a local favorite", start: "12:30", end: "13:30", place: stop, notes: "Hours (check)" },
      { kind: "free", title: "Open afternoon", start: null, end: null, place: null, notes: "" },
      { kind: "activity", title: "Sunset viewpoint", start: "18:30", end: "19:30", place: stop, notes: "" },
    ],
  }));
}

/**
 * Re-plan stand-in: chill days drop the busiest unlocked item and add open
 * time; packed days add an outing. Locked items are never returned.
 */
export function mockReplan(
  items: (PlanItemDraft & { locked: boolean })[],
  vibe: { pace: number }
): { summary: string; items: PlanItemDraft[] } {
  const unlocked: PlanItemDraft[] = items
    .filter((i) => !i.locked)
    .map((i) => ({ kind: i.kind, title: i.title, start: i.start, end: i.end, place: i.place, notes: i.notes }));
  if (vibe.pace < 40) {
    const kept = unlocked.filter((i) => i.kind !== "activity" || i.title.toLowerCase().includes("sunset"));
    return {
      summary: "Slowed the day down: dropped the morning outing and left the afternoon open.",
      items: [...kept, { kind: "free", title: "Slow morning at camp", start: "08:00", end: "10:30", place: null, notes: "" }],
    };
  }
  if (vibe.pace > 60) {
    return {
      summary: "Filled the day out with an extra outing.",
      items: [...unlocked, { kind: "activity", title: "Afternoon scenic drive", start: "15:00", end: "17:00", place: null, notes: "" }],
    };
  }
  return { summary: "This day already fits the vibe.", items: unlocked };
}

// ---------- Place deep-dive stand-ins ----------

export function mockPlaceFacts(name: string, from: string): {
  wiki: WikiSummary;
  weather: { kind: "forecast"; days: WeatherDay[] };
  holidays: Holiday[];
} {
  return {
    wiki: { title: name, extract: `${name} is a sample place used in tests. It has a long and colorful past.`, url: "https://en.wikipedia.org/wiki/Sample" },
    weather: {
      kind: "forecast",
      days: [{ date: from, high: 24, low: 9, rain: 10, rainUnit: "%", label: "Clear" }],
    },
    holidays: [{ date: from, name: "Sample Day" }],
  };
}

export function mockPlaceInfo(name: string): { info: PlaceInfo; sources: Source[] } {
  return {
    info: {
      summary: `${name} suits a slow, scenic stay with good light at both ends of the day.`,
      history: `People have passed through ${name} for centuries. The town grew around a trading post.`,
      highlights: [
        { title: "The overlook trail", why: "Big views for photos at golden hour" },
        { title: "Old main street", why: "History and a good coffee stop" },
      ],
      tips: ["Parking fills by 9am on weekends.", "Bring layers; evenings get cold."],
      bestTimes: ["Overlook at sunset, arrive 45 minutes early"],
      happening: [{ title: "Saturday farmers market", when: "Saturdays, 8am to noon", url: "https://example.com/market" }],
    },
    sources: [{ title: "Example events listing", url: "https://example.com/market" }],
  };
}

export function mockHours(query: string): HoursResult {
  return {
    available: true,
    name: query,
    address: "123 Sample St",
    lines: ["Monday: 8:00 AM to 5:00 PM", "Tuesday: Closed"],
    mapsUrl: "https://maps.google.com/?cid=1",
    checkedAt: Date.now(),
  };
}
