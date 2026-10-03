import { requireMember } from "@/lib/ai/guard";
import { addUsage, runStructured, type Usage } from "@/lib/ai/claude";
import { mockOptions } from "@/lib/ai/mocks";
import { OPTIONS_SYSTEM, optionsPrompt } from "@/lib/ai/prompts/options";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { MAX_TRIP_DAYS, OptionsRequestSchema, readJson } from "@/lib/ai/requests";
import { dayCount, missingForOptions } from "@/lib/model/inputs";
import { OptionsResultSchema, tooSimilar, type TripOption } from "@/lib/model/plan";

// Opus at high effort can think for a while on a long trip.
export const maxDuration = 300;

function anyTooSimilar(options: TripOption[]): boolean {
  for (let i = 0; i < options.length; i++)
    for (let j = i + 1; j < options.length; j++) if (tooSimilar(options[i], options[j])) return true;
  return false;
}

/** Draft three distinct takes on a trip. */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;

  const body = await readJson(req, OptionsRequestSchema);
  if (!body.ok) return body.response;
  const { trip, inputs, today } = body.data;

  const missing = missingForOptions(trip, inputs);
  if (missing.length) return Response.json({ error: `Add ${missing.join(" and ")} first.` }, { status: 400 });
  if (trip.endDate < trip.startDate) return Response.json({ error: "The end date is before the start." }, { status: 400 });
  if (dayCount(trip.startDate, trip.endDate) > MAX_TRIP_DAYS) {
    return Response.json({ error: `Sidequest plans up to ${MAX_TRIP_DAYS} days at a time. Split this one into parts.` }, { status: 400 });
  }

  if (process.env.AI_MOCK === "1") {
    return Response.json({ options: mockOptions(trip, inputs), usage: null });
  }

  const brief = describeTrip(trip, inputs, today);
  const usages: Usage[] = [];
  let prompt = optionsPrompt(brief);

  // One retry if two options are basically the same trip.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runStructured({
      role: "planner",
      effort: "high",
      system: OPTIONS_SYSTEM,
      prompt,
      schema: OptionsResultSchema,
      maxTokens: 16000,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    usages.push(result.usage);
    if (!anyTooSimilar(result.data.options) || attempt === 1) {
      return Response.json({ options: result.data.options, usage: addUsage(usages) });
    }
    prompt += "\n\nYour last three options overlapped too much. Make each a clearly different route or rhythm.";
  }
  return Response.json({ error: "Couldn't draft options. Try again." }, { status: 502 });
}
