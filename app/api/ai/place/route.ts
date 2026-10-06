import { requireMember } from "@/lib/ai/guard";
import { streamJob } from "@/lib/ai/stream-job";
import { addUsage, runStructured } from "@/lib/ai/claude";
import { mockPlaceInfo } from "@/lib/ai/mocks";
import { research } from "@/lib/ai/research";
import { RESEARCH_SYSTEM, researchPrompt, STRUCTURE_SYSTEM, structurePrompt } from "@/lib/ai/prompts/place";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { PlaceDeepDiveRequestSchema, readJson } from "@/lib/ai/requests";
import { PlaceInfoSchema } from "@/lib/model/place";

export const maxDuration = 300;
const DEADLINE_MS = 270_000;

/**
 * A place deep-dive for this trip: Sonnet researches with web search and
 * writes cited notes, then Haiku shapes them into the app's format. Sources
 * come from the citations, not from the model's memory.
 */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;
  const body = await readJson(req, PlaceDeepDiveRequestSchema);
  if (!body.ok) return body.response;
  const { trip, inputs, place, from, to, today, wiki } = body.data;

  return streamJob(async (progress) => {
    progress("reading");
    if (process.env.AI_MOCK === "1") {
      await pause(100);
      [1, 2, 3].forEach((count) => progress("searching", { count }));
      progress("writing");
      return { ok: true, data: { ...mockPlaceInfo(place.name), usage: null } };
    }

    const started = Date.now();
    progress("searching", { count: 0 });
    const notes = await research(RESEARCH_SYSTEM, researchPrompt(place.name, describeTrip(trip, inputs, today), from, to, wiki), 6, {
      deadlineMs: DEADLINE_MS,
      onSearch: (count) => progress("searching", { count }),
    });
    if (!notes.ok) return notes;

    progress("writing");
    const shaped = await runStructured(
      {
        role: "quick",
        effort: "low",
        system: STRUCTURE_SYSTEM,
        prompt: structurePrompt(notes.notes, notes.sources),
        schema: PlaceInfoSchema,
        maxTokens: 6000,
      },
      { deadlineMs: DEADLINE_MS - (Date.now() - started) }
    );
    if (!shaped.ok) return shaped;
    return { ok: true, data: { info: shaped.data, sources: notes.sources, usage: addUsage([notes.usage, shaped.usage]) } };
  });
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
