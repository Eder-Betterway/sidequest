import { requireMember } from "@/lib/ai/guard";
import { runStructured } from "@/lib/ai/claude";
import { mockReroute } from "@/lib/ai/mocks";
import { REROUTE_SYSTEM, reroutePrompt } from "@/lib/ai/prompts/reroute";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { readJson, RerouteRequestSchema } from "@/lib/ai/requests";
import { geocodeAll } from "@/lib/grounding/geocode";
import { weatherBrief } from "@/lib/grounding/weather-brief";
import { RerouteResultSchema, type DayDraft } from "@/lib/model/plan";

export const maxDuration = 300;

/**
 * Change the trip from a plain request. Opus juggles the whole itinerary and
 * returns only the days that change; new bases are looked up on the map here.
 * The phone turns the answer into a suggestion to accept or skip day by day.
 */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;
  const body = await readJson(req, RerouteRequestSchema);
  if (!body.ok) return body.response;
  const { trip, inputs, days, instruction, focusDate, today } = body.data;

  let summary: string;
  let changed: DayDraft[];
  let usage = null;
  if (process.env.AI_MOCK === "1") {
    ({ summary, days: changed } = mockReroute(days, focusDate));
  } else {
    const weather = await weatherBrief(days, today);
    const result = await runStructured({
      role: "planner",
      effort: "high",
      system: REROUTE_SYSTEM,
      prompt: reroutePrompt(describeTrip(trip, inputs, today), days, instruction, focusDate, weather),
      schema: RerouteResultSchema,
      maxTokens: 16000,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    ({ summary, days: changed } = result.data);
    usage = result.usage;
  }

  // Only days that are on the trip, once each.
  const byDate = new Map(days.map((d) => [d.date, d]));
  const seen = new Set<string>();
  changed = changed.filter((d) => byDate.has(d.date) && !seen.has(d.date) && seen.add(d.date));

  // Look up new bases so sun times, weather, and van spots follow the move.
  const moved = changed.filter((d) => d.base !== byDate.get(d.date)!.base).map((d) => d.base);
  const places = await geocodeAll(moved);
  return Response.json({
    summary,
    days: changed.map((d) => ({ ...d, place: places.get(d.base) ?? null })),
    usage,
  });
}
