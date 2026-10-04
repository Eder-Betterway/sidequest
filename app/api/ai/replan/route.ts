import { requireMember } from "@/lib/ai/guard";
import { runStructured } from "@/lib/ai/claude";
import { mockReplan } from "@/lib/ai/mocks";
import { REPLAN_SYSTEM, replanPrompt } from "@/lib/ai/prompts/replan";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { readJson, ReplanRequestSchema } from "@/lib/ai/requests";
import { ReplanResultSchema } from "@/lib/model/plan";

export const maxDuration = 300;

/**
 * Suggest a new version of one day's unlocked items. The phone turns the
 * answer into a proposal (a list of changes to accept or skip).
 */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;

  const body = await readJson(req, ReplanRequestSchema);
  if (!body.ok) return body.response;
  const { trip, inputs, day, items, vibe, note, today } = body.data;

  if (process.env.AI_MOCK === "1") {
    return Response.json({ ...mockReplan(items, vibe, note), usage: null });
  }

  const result = await runStructured({
    role: "everyday",
    effort: "medium",
    system: REPLAN_SYSTEM,
    prompt: replanPrompt(describeTrip(trip, inputs, today), day, items, vibe, note),
    schema: ReplanResultSchema,
    maxTokens: 8000,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ...result.data, usage: result.usage });
}
