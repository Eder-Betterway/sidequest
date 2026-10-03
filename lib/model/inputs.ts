import { z } from "zod";

/**
 * Everything the trip wizard asks, stored on the trip as `inputs`. All fields
 * are optional-friendly: a trip can be generated from just dates and a region,
 * and every extra answer makes the options better.
 */

export const TRANSPORT_MODES = ["campervan", "car", "flights", "train", "bus", "ferry", "bike", "walking"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const INTERESTS = [
  "photography",
  "climbing",
  "hiking",
  "breweries",
  "wine",
  "live music",
  "history",
  "museums",
  "food",
  "coffee",
  "hot springs",
  "beaches",
  "wildlife",
  "stargazing",
  "art",
  "nightlife",
  "markets",
  "architecture",
] as const;

export const LODGING = ["dispersed camping", "campgrounds", "hostels", "hotels", "rentals", "friends"] as const;

export const MilestoneSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  kind: z.enum(["wedding", "conference", "concert", "festival", "meetup", "booking", "other"]),
  /** ISO date. */
  date: z.string(),
  endDate: z.string().nullable().default(null),
  /** "HH:MM", optional. */
  time: z.string().nullable().default(null),
  place: z.string().max(160).default(""),
  priority: z.enum(["required", "preferred"]),
  /** Days to arrive early / rest after (travel buffer, recovery). */
  bufferBeforeDays: z.number().int().min(0).max(5).default(0),
  bufferAfterDays: z.number().int().min(0).max(5).default(0),
  notes: z.string().max(500).default(""),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const VehicleSchema = z.object({
  /** Meters / tonnes / km; the form converts from feet and miles. */
  lengthM: z.number().positive().nullable().default(null),
  heightM: z.number().positive().nullable().default(null),
  widthM: z.number().positive().nullable().default(null),
  weightT: z.number().positive().nullable().default(null),
  rangeKm: z.number().positive().nullable().default(null),
  fourWheelDrive: z.boolean().default(false),
  /** How many nights you can go without hookups (water, power, dump). */
  offGridNights: z.number().int().min(0).max(30).nullable().default(null),
  notes: z.string().max(300).default(""),
});
export type Vehicle = z.infer<typeof VehicleSchema>;

export const TravelerSchema = z.object({
  /** Whatever you call yourselves in the app; never leaves your database. */
  label: z.string().max(40),
  interests: z.array(z.string()).default([]),
  /** Free text: "5.10 climber", "max 15 km hikes", "vegetarian". */
  notes: z.string().max(300).default(""),
});

export const TripInputsSchema = z.object({
  regions: z.array(z.string().min(1).max(120)).default([]),
  /** Where you start and end, if fixed ("Denver", "wherever"). */
  startPlace: z.string().max(120).default(""),
  endPlace: z.string().max(120).default(""),
  flexibleDays: z.number().int().min(0).max(14).default(0),
  milestones: z.array(MilestoneSchema).default([]),

  modes: z.array(z.enum(TRANSPORT_MODES)).default([]),
  vehicle: VehicleSchema.nullable().default(null),
  maxDriveHoursPerDay: z.number().min(1).max(14).nullable().default(null),
  noNightDriving: z.boolean().default(false),
  minNightsPerStop: z.number().int().min(1).max(7).default(1),

  travelers: z.array(TravelerSchema).default([]),
  sharedInterests: z.array(z.string()).default([]),

  budget: z.enum(["shoestring", "comfortable", "splurge"]).default("comfortable"),
  lodging: z.array(z.enum(LODGING)).default([]),
  wakeStyle: z.enum(["sunrise", "normal", "sleep in"]).default("normal"),
  restEveryNDays: z.number().int().min(0).max(14).default(0),
  workDays: z.string().max(300).default(""),
  hardNos: z.string().max(300).default(""),
  mustDos: z.string().max(500).default(""),
  photoGoals: z.string().max(300).default(""),
  weather: z.string().max(200).default(""),
  alreadyBooked: z.string().max(500).default(""),
  surpriseMe: z.boolean().default(false),
  units: z.enum(["imperial", "metric"]).default("imperial"),
  homeCurrency: z.string().length(3).default("USD"),
  extraNotes: z.string().max(1000).default(""),
});
export type TripInputs = z.infer<typeof TripInputsSchema>;

export function defaultInputs(): TripInputs {
  return TripInputsSchema.parse({});
}

/** Read inputs from a stored trip, tolerating older or partial records. */
export function readInputs(raw: unknown): TripInputs {
  const parsed = TripInputsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : defaultInputs();
}

export const FT_PER_M = 3.28084;
export const MI_PER_KM = 0.621371;

/** What still has to be filled in before Sidequest can draft options. */
export function missingForOptions(
  trip: { startDate: string | null; endDate: string | null },
  inputs: TripInputs
): string[] {
  const missing: string[] = [];
  if (!trip.startDate || !trip.endDate) missing.push("start and end dates");
  if (inputs.regions.length === 0 && !inputs.startPlace) missing.push("at least one region or a starting point");
  if (inputs.modes.length === 0) missing.push("how you're getting around");
  return missing;
}

export function dayCount(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** ISO date `n` days after `iso`. */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
