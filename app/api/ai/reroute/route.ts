import { requireMember } from "@/lib/ai/guard";
import { runStructured } from "@/lib/ai/claude";
import { mockReroute } from "@/lib/ai/mocks";
import { REROUTE_SYSTEM, reroutePrompt } from "@/lib/ai/prompts/reroute";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { readJson, RerouteRequestSchema } from "@/lib/ai/requests";
import { geocodeAll } from "@/lib/grounding/geocode";
import { weatherBrief } from "@/lib/grounding/weather-brief";
import { RerouteResultSchema, type DayDraft } from "@/lib/model/plan";
import { daysWritten, streamJob } from "@/lib/ai/progress";

export const maxDuration = 300;
/** Stop Claude a little before Vercel's limit, so the phone gets a clear answer. */
const DEADLINE_MS = 270_000;

/**
 * Change the trip from a plain request. Opus juggles the whole itinerary and
 * returns only the days that change; new bases are looked up on the map here.
 * The phone turns the answer into a suggestion to accept or skip day by day.
 * Progress streams back as it goes (see lib/ai/progress.ts).
 */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;
  const body = await readJson(req, RerouteRequestSchema);
  if (!body.ok) return body.response;
  const { trip, inputs, days, instruction, focusDate, today } = body.data;

  return streamJob(async (progress) => {
    let summary: string;
    let changed: DayDraft[];
    let usage = null;
    progress("reading");
    if (process.env.AI_MOCK === "1") {
      ({ summary, days: changed } = mockReroute(days, focusDate, instruction));
      // Walk through the stages so the phone's progress can be tested.
      await pause(150);
      progress("thinking");
      await pause(150);
      changed.forEach((_, i) => progress("writing", { days: i + 1 }));
      if (instruction.includes("[mock:too-long]")) {
        return { ok: false, status: 502, error: "Claude's answer ran too long and got cut off. Try fewer changes at once, or change one day at a time." };
      }
    } else {
      const weather = await weatherBrief(days, today);
      progress("thinking");
      let written = 0;
      const result = await runStructured(
        {
          role: "planner",
          effort: "medium",
          system: REROUTE_SYSTEM,
          prompt: reroutePrompt(describeTrip(trip, inputs, today), days, instruction, focusDate, weather),
          schema: RerouteResultSchema,
          maxTokens: 32000,
        },
        {
          deadlineMs: DEADLINE_MS,
          onText: (soFar) => {
            const n = daysWritten(soFar);
            if (n !== written || written === 0) {
              written = n;
              progress("writing", { days: n });
            }
          },
        }
      );
      if (!result.ok) return result;
      ({ summary, days: changed } = result.data);
      usage = result.usage;
    }

    // Only days that are on the trip, once each.
    const byDate = new Map(days.map((d) => [d.date, d]));
    const seen = new Set<string>();
    changed = changed.filter((d) => byDate.has(d.date) && !seen.has(d.date) && seen.add(d.date));

    // Look up new bases so sun times, weather, and van spots follow the move.
    progress("places");
    const moved = changed.filter((d) => d.base !== byDate.get(d.date)!.base).map((d) => d.base);
    const places = await geocodeAll(moved);
    return { ok: true, data: { summary, days: changed.map((d) => ({ ...d, place: places.get(d.base) ?? null })), usage } };
  });
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
