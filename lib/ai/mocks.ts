import { dayCount, type TripInputs } from "@/lib/model/inputs";
import type { DayDraft, TripOption } from "@/lib/model/plan";

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
