import { z } from "zod";
import { TripInputsSchema } from "@/lib/model/inputs";
import { OptionSchema } from "@/lib/model/plan";

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
