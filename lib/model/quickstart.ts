import { z } from "zod";
import { INTERESTS, LODGING, MilestoneSchema, TRANSPORT_MODES, TripInputsSchema, VehicleSchema, type TripInputs } from "./inputs";

/**
 * Start a trip from one sentence ("Two weeks, SoCal desert in the van,
 * wedding in Palm Springs on Nov 14, we love climbing and hot springs").
 * Claude fills in what it can; you review it before the trip is made.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** What Claude returns. No defaults: structured outputs want every field spelled out. */
export const QuickStartSchema = z.object({
  title: z.string().describe("A short, vivid trip name, 2 to 4 words"),
  startDate: z.string().nullable().describe("YYYY-MM-DD, resolved from what they said and today's date, or null if unknown"),
  endDate: z.string().nullable().describe("YYYY-MM-DD, or null. 'Two weeks from the 1st' means start + 13 days"),
  flexibleDays: z.number().int().nullable().describe("Days the dates can shift, if they said so, else null"),
  regions: z.array(z.string()).describe("Areas or places to explore, map-findable, e.g. 'Joshua Tree, California'"),
  startPlace: z.string().nullable(),
  endPlace: z.string().nullable(),
  milestones: z
    .array(
      z.object({
        title: z.string(),
        kind: z.enum(["wedding", "conference", "concert", "festival", "meetup", "booking", "other"]),
        date: z.string().describe("YYYY-MM-DD"),
        endDate: z.string().nullable(),
        time: z.string().nullable().describe("HH:MM 24h, or null"),
        place: z.string().nullable(),
        priority: z.enum(["required", "preferred"]).describe("required unless they sound unsure"),
      })
    )
    .describe("Fixed events with a date they must or want to be at"),
  modes: z.array(z.enum(TRANSPORT_MODES)).describe("How they're getting around, only if said or clearly implied"),
  vehicle: z
    .object({
      lengthM: z.number().nullable(),
      heightM: z.number().nullable(),
      weightT: z.number().nullable(),
      rangeKm: z.number().nullable(),
      fourWheelDrive: z.boolean().nullable(),
      notes: z.string().nullable(),
    })
    .nullable()
    .describe("Only if they described the vehicle; convert to meters, tonnes, km"),
  maxDriveHoursPerDay: z.number().nullable(),
  interests: z.array(z.string()).describe(`What they're into. Use these words when they match: ${INTERESTS.join(", ")}`),
  lodging: z.array(z.enum(LODGING)),
  budget: z.enum(["shoestring", "comfortable", "splurge"]).nullable(),
  pace: z.enum(["chill", "balanced", "packed"]).nullable(),
  mustDos: z.string().nullable(),
  hardNos: z.string().nullable(),
  units: z.enum(["imperial", "metric"]).nullable().describe("metric if they use km or °C, imperial if miles or °F, else null"),
  otherNotes: z.string().nullable().describe("Anything else useful they said that doesn't fit above, in their words"),
});
export type QuickStart = z.infer<typeof QuickStartSchema>;

export interface TripStart {
  title: string;
  startDate: string | null;
  endDate: string | null;
  inputs: TripInputs;
}

const PACE = { chill: 25, balanced: 50, packed: 80 } as const;
const clip = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);
const date = (s: string | null | undefined) => (s && ISO.test(s) ? s : null);

/**
 * Shape Claude's answer into a trip, keeping only what's valid. Anything odd
 * (a bad date, an unknown mode) is dropped rather than failing the whole thing.
 */
export function toTripStart(q: QuickStart, today: string, idSeed = Date.now()): TripStart {
  let startDate = date(q.startDate);
  let endDate = date(q.endDate);
  if (startDate && startDate < today) startDate = null;
  if (startDate && endDate && endDate < startDate) endDate = null;
  if (!startDate) endDate = null;

  const milestones = q.milestones
    .filter((m) => date(m.date) && m.title.trim())
    .slice(0, 10)
    .map((m, i) =>
      MilestoneSchema.parse({
        id: `m_${idSeed.toString(36)}_${i}`,
        title: clip(m.title, 120),
        kind: m.kind,
        date: m.date,
        endDate: date(m.endDate),
        time: m.time && TIME.test(m.time) ? m.time : null,
        place: clip(m.place, 160),
        priority: m.priority,
      })
    );

  const v = q.vehicle;
  const pos = (n: number | null | undefined) => (typeof n === "number" && n > 0 ? n : null);
  const vehicle =
    v && (pos(v.lengthM) || pos(v.heightM) || pos(v.weightT) || pos(v.rangeKm) || v.fourWheelDrive || v.notes)
      ? VehicleSchema.parse({
          lengthM: pos(v.lengthM),
          heightM: pos(v.heightM),
          weightT: pos(v.weightT),
          rangeKm: pos(v.rangeKm),
          fourWheelDrive: Boolean(v.fourWheelDrive),
          notes: clip(v.notes, 300),
        })
      : null;

  const drive = q.maxDriveHoursPerDay;
  const inputs = TripInputsSchema.parse({
    regions: [...new Set(q.regions.map((r) => clip(r, 120)).filter(Boolean))].slice(0, 12),
    startPlace: clip(q.startPlace, 120),
    endPlace: clip(q.endPlace, 120),
    flexibleDays: Math.max(0, Math.min(14, Math.round(q.flexibleDays ?? 0))),
    milestones,
    modes: [...new Set(q.modes)],
    vehicle,
    maxDriveHoursPerDay: typeof drive === "number" && drive >= 1 ? Math.min(14, drive) : null,
    sharedInterests: [...new Set(q.interests.map((i) => clip(i, 40).toLowerCase()).filter(Boolean))].slice(0, 15),
    lodging: [...new Set(q.lodging)],
    ...(q.budget ? { budget: q.budget } : {}),
    ...(q.pace ? { vibe: { pace: PACE[q.pace], effort: 50, path: 50, nights: 50 } } : {}),
    mustDos: clip(q.mustDos, 500),
    hardNos: clip(q.hardNos, 300),
    ...(q.units ? { units: q.units } : {}),
    extraNotes: clip(q.otherNotes, 1000),
  });

  return { title: clip(q.title, 120) || "New trip", startDate, endDate, inputs };
}

/** One line per thing that got filled in, for the review before creating the trip. */
export function summarize(t: TripStart): { label: string; value: string }[] {
  const i = t.inputs;
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string) => value && rows.push({ label, value });
  add("Places", i.regions.join(", "));
  add("Starts / ends", [i.startPlace, i.endPlace].filter(Boolean).join(" to "));
  add("Milestones", i.milestones.map((m) => `${m.title} (${m.date}${m.time ? ` ${m.time}` : ""})`).join("; "));
  add("Getting around", i.modes.join(", "));
  add("Max driving", i.maxDriveHoursPerDay ? `${i.maxDriveHoursPerDay} h a day` : "");
  add("Into", i.sharedInterests.join(", "));
  add("Staying in", i.lodging.join(", "));
  add("Must-dos", i.mustDos);
  add("Hard nos", i.hardNos);
  add("Notes", i.extraNotes);
  return rows;
}
