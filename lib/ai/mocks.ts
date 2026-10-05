import type { ParksInfo } from "@/lib/grounding/parks";
import { glowFrom, type Glow } from "@/lib/grounding/sky";
import { dayCount, type TripInputs } from "@/lib/model/inputs";
import type { DayDraft, PlanItemDraft, TripOption } from "@/lib/model/plan";
import type { FlyerEvent } from "@/lib/model/note";
import type { VanSpot } from "@/lib/model/van";
import type { QuickStart } from "@/lib/model/quickstart";
import { addDays } from "@/lib/model/inputs";
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
  vibe: { pace: number },
  note: string | null = null
): { summary: string; items: PlanItemDraft[] } {
  const unlocked: PlanItemDraft[] = items
    .filter((i) => !i.locked)
    .map((i) => ({ kind: i.kind, title: i.title, start: i.start, end: i.end, place: i.place, notes: i.notes }));
  if (note) {
    // A tip: work it in as one new item, keep the rest.
    const gist = note.split("\n")[0].slice(0, 60);
    return {
      summary: "Worked your tip into the day.",
      items: [...unlocked, { kind: "activity", title: `Tip: ${gist}`, start: "16:00", end: "17:00", place: null, notes: "From your note" }],
    };
  }
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
  nightClouds: { date: string; cloud: number }[];
  glow: Glow;
  parks: ParksInfo;
} {
  return {
    wiki: { title: name, extract: `${name} is a sample place used in tests. It has a long and colorful past.`, url: "https://en.wikipedia.org/wiki/Sample" },
    weather: {
      kind: "forecast",
      days: [{ date: from, high: 24, low: 9, rain: 10, rainUnit: "%", label: "Clear" }],
    },
    holidays: [{ date: from, name: "Sample Day" }],
    nightClouds: [{ date: from, cloud: 5 }],
    glow: glowFrom([{ name: "Sample Town", population: 30000, km: 40 }]),
    parks: {
      park: {
        name: "Sample National Park",
        code: "samp",
        url: "https://www.nps.gov/samp/",
        km: 4,
        alerts: [{ title: "Scenic road closed for repairs", category: "Park Closure", description: "The upper loop is closed weekdays.", url: "https://www.nps.gov/samp/planyourvisit/conditions.htm" }],
      },
      campgrounds: [{ id: "123456", name: "Sample Rocks Campground", url: "https://www.recreation.gov/camping/campgrounds/123456", km: 6 }],
      checked: { nps: true, ridb: true },
    },
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
      food: [
        { name: "Sample Coffee Co", kind: "coffee", why: "Strong espresso and breakfast burritos", price: "$" },
        { name: "The Sample Grill", kind: "dinner", why: "Patio dinner with a sunset view", price: "$$" },
      ],
      bookAhead: [{ what: "Campsite at Sample Rocks", lead: "Opens 6 months ahead, weekends sell out", how: "Recreation.gov", url: "https://www.recreation.gov/" }],
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

// ---------- Notes stand-ins ----------

export function mockAnswer(question: string): { text: string; sources: { title: string; url: string }[] } {
  return {
    text: `Short answer: yes. For "${question.slice(0, 80)}", go early and check the posted hours before you drive over.`,
    sources: [{ title: "Example visitor guide", url: "https://example.com/guide" }],
  };
}

export function mockFlyer(startDate: string): { events: FlyerEvent[] } {
  return {
    events: [
      { title: "Night market", date: startDate, start: "18:00", end: "22:00", place: "Main street", notes: "Cash only" },
      { title: "Open mic", date: null, start: "20:00", end: null, place: "The corner cafe", notes: "" },
    ],
  };
}

// ---------- Van stand-ins ----------

export function mockLeg() {
  return { km: 412, hours: 5.5, source: "route" as const, profile: "driving-car" };
}

export function mockSpots(c: { lat: number; lng: number }): VanSpot[] {
  return [
    { id: "node/1", kind: "camp", name: "Canyon Rim Campground", lat: c.lat + 0.05, lng: c.lng, km: 5.6, fee: true, maxLengthM: 7, url: "https://example.com/camp", facts: ["Toilets", "Water too"] },
    { id: "node/2", kind: "camp", name: "BLM dispersed area", lat: c.lat - 0.1, lng: c.lng, km: 11.1, fee: false, maxLengthM: null, url: null, facts: [] },
    { id: "node/3", kind: "dump", name: "Gas station dump", lat: c.lat, lng: c.lng + 0.02, km: 1.8, fee: true, maxLengthM: null, url: null, facts: ["Water too"] },
  ];
}

// ---------- Trip change stand-in ----------

/**
 * "Stay on" stand-in: every day the request names ("On 2026-11-04: ..."), or
 * else the asked-about day (or the last day), moves to Palm Springs and gains
 * one item; its unlocked items stay as they were.
 */
export function mockReroute(
  days: { date: string; base: string; items: (PlanItemDraft & { locked: boolean })[] }[],
  focusDate: string | null,
  instruction = ""
): { summary: string; days: DayDraft[] } {
  const named = [...instruction.matchAll(/On (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  const targets = named.length
    ? days.filter((d) => named.includes(d.date))
    : [days.find((d) => d.date === focusDate) ?? days[days.length - 1]];
  return {
    summary: "Stayed on in Palm Springs for the wedding and pushed the next stop back a day.",
    days: targets.map((target) => ({
      date: target.date,
      base: "Palm Springs",
      title: "Staying on in Palm Springs",
      items: [
        ...target.items
          .filter((i) => !i.locked)
          .map((i) => ({ kind: i.kind, title: i.title, start: i.start, end: i.end, place: i.place, notes: i.notes })),
        { kind: "activity" as const, title: "Pool afternoon before the wedding", start: "14:00", end: "16:00", place: "Palm Springs", notes: "" },
      ],
    })),
  };
}

// ---------- Quick start stand-in ----------

/** A van trip a month out, two weeks long, with a wedding near the end. */
export function mockQuickStart(today: string): QuickStart {
  const start = addDays(today, 30);
  return {
    title: "Desert wedding loop",
    startDate: start,
    endDate: addDays(start, 13),
    flexibleDays: null,
    regions: ["Joshua Tree, California", "Palm Springs, California"],
    startPlace: null,
    endPlace: null,
    milestones: [
      { title: "Friends' wedding", kind: "wedding", date: addDays(start, 12), endDate: null, time: "16:00", place: "Palm Springs, California", priority: "required" },
    ],
    modes: ["campervan"],
    vehicle: null,
    maxDriveHoursPerDay: null,
    interests: ["climbing", "hot springs"],
    lodging: [],
    budget: null,
    pace: "chill",
    mustDos: null,
    hardNos: null,
    units: null,
    otherNotes: null,
  };
}
