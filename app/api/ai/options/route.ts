import { requireMember } from "@/lib/ai/guard";
import { onCount } from "@/lib/ai/progress";
import { streamJob } from "@/lib/ai/stream-job";
import { addUsage, runStructured, type Usage } from "@/lib/ai/claude";
import { mockOptions } from "@/lib/ai/mocks";
import { OPTIONS_SYSTEM, optionsPrompt } from "@/lib/ai/prompts/options";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { MAX_TRIP_DAYS, OptionsRequestSchema, readJson } from "@/lib/ai/requests";
import { dayCount, missingForOptions } from "@/lib/model/inputs";
import { OptionsResultSchema, tooSimilar, type TripOption } from "@/lib/model/plan";

// Opus at high effort can think for a while on a long trip.
export const maxDuration = 300;
const DEADLINE_MS = 270_000;

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

  return streamJob(async (progress) => {
    progress("reading");
    if (process.env.AI_MOCK === "1") {
      progress("thinking");
      await pause(100);
      [1, 2, 3].forEach((count) => progress("writing", { count, total: 3 }));
      // A made-up usage so the spend estimate has something to show in tests.
      return { ok: true, data: { options: mockOptions(trip, inputs), usage: { model: "claude-opus-5-5", inputTokens: 20000, outputTokens: 5000, cacheReadTokens: 0 } } };
    }

    const brief = describeTrip(trip, inputs, today);
    const usages: Usage[] = [];
    let prompt = optionsPrompt(brief);
    // One clock for both attempts, so the retry can't run past the limit.
    const started = Date.now();
    const left = () => DEADLINE_MS - (Date.now() - started);

    // One retry if two options are basically the same trip.
    for (let attempt = 0; attempt < 2; attempt++) {
      progress("thinking");
      const result = await runStructured(
        {
          role: "planner",
          effort: "high",
          system: OPTIONS_SYSTEM,
          prompt,
          schema: OptionsResultSchema,
          maxTokens: 16000,
        },
        { deadlineMs: left(), onText: onCount("pitch", (count) => progress("writing", { count, total: 3 })) }
      );
      if (!result.ok) return result;
      usages.push(result.usage);
      // Too similar, but not enough time left to try again: keep what we have.
      if (!anyTooSimilar(result.data.options) || attempt === 1 || left() < 90_000) {
        return { ok: true, data: { options: result.data.options, usage: addUsage(usages) } };
      }
      prompt += "\n\nYour last three options overlapped too much. Make each a clearly different route or rhythm.";
    }
    return { ok: false, status: 502, error: "Couldn't draft options. Try again." };
  });
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
