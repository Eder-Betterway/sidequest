import { z } from "zod";
import { TripInputsSchema, VehicleSchema } from "@/lib/model/inputs";
import { OptionSchema, PlanItemSchema } from "@/lib/model/plan";
import { VibeSchema } from "@/lib/plan/vibe";

/** Request bodies the AI routes accept. Validated before anything is spent. */

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TripBriefSchema = z.object({
  title: z.string().min(1).max(120),
  startDate: ISO,
  endDate: ISO,
});

export const OptionsRequestSchema = z.object({
  trip: TripBriefSchema,
  inputs: TripInputsSchema,
  today: ISO,
});

export const ExpandRequestSchema = z.object({
  trip: TripBriefSchema,
  inputs: TripInputsSchema,
  option: OptionSchema,
  today: ISO,
});

export const ReplanRequestSchema = z.object({
  trip: TripBriefSchema,
  inputs: TripInputsSchema,
  day: z.object({ date: ISO, base: z.string().max(200), title: z.string().max(200) }),
  items: z.array(PlanItemSchema.extend({ locked: z.boolean() })).max(40),
  vibe: VibeSchema,
  /** Extra instruction, like a tip from a local. */
  note: z.string().max(1000).nullable().default(null),
  today: ISO,
});

const PlaceRef = z.object({
  name: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  countryCode: z.string().max(3).nullable().default(null),
});

export const PlaceFactsRequestSchema = z.object({
  place: PlaceRef,
  from: ISO,
  to: ISO,
  today: ISO,
});

export const PlaceDeepDiveRequestSchema = z.object({
  trip: TripBriefSchema,
  inputs: TripInputsSchema,
  place: z.object({ name: z.string().min(1).max(200) }),
  from: ISO,
  to: ISO,
  today: ISO,
  wiki: z.object({ title: z.string().max(300), extract: z.string().max(5000), url: z.string().max(500) }).nullable().default(null),
});

export const HoursRequestSchema = z.object({
  query: z.string().min(1).max(300),
  near: z.object({ lat: z.number(), lng: z.number() }).nullable().default(null),
});

const PlanItemBrief = z.object({
  start: z.string().max(5).nullable(),
  title: z.string().max(200),
  place: z.string().max(200).nullable(),
  locked: z.boolean(),
});

export const AskRequestSchema = z.object({
  trip: TripBriefSchema,
  inputs: TripInputsSchema,
  question: z.string().min(1).max(1000),
  /** The day it's about, if any. */
  dayDate: ISO.nullable().default(null),
  /** The plan as it stands, so answers fit it. */
  days: z
    .array(z.object({ date: ISO, base: z.string().max(200), title: z.string().max(200), items: z.array(PlanItemBrief).max(40) }))
    .max(60)
    .default([]),
  /** Recent notes and tips, newest first. */
  notes: z.array(z.string().max(1000)).max(30).default([]),
  today: ISO,
});

export const FlyerRequestSchema = z.object({
  trip: TripBriefSchema,
  /** Shrunk JPEG from the phone, base64 without the "data:" prefix. */
  image: z.string().min(100).max(1_400_000),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  /** Where they were when they snapped it. */
  near: z.string().max(200).nullable().default(null),
  today: ISO,
});

const NamedPoint = z.object({
  name: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const LegRequestSchema = z.object({
  from: NamedPoint,
  to: NamedPoint,
  vehicle: VehicleSchema.nullable().default(null),
});

export const NearbyRequestSchema = z.object({
  place: NamedPoint,
});

/** Trips longer than this would cost a lot per generation; plan them in parts. */
export const MAX_TRIP_DAYS = 45;

export async function readJson<S extends z.ZodType>(req: Request, schema: S) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false as const, response: Response.json({ error: "Expected JSON." }, { status: 400 }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: Response.json({ error: "Some trip details are missing or invalid.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 }),
    };
  }
  return { ok: true as const, data: parsed.data as z.infer<S> };
}
