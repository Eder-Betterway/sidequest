import { requireMember } from "@/lib/ai/guard";
import { onCount, streamJob } from "@/lib/ai/progress";
import { runStructured } from "@/lib/ai/claude";
import { mockReplan } from "@/lib/ai/mocks";
import { REPLAN_SYSTEM, replanPrompt } from "@/lib/ai/prompts/replan";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { readJson, ReplanRequestSchema } from "@/lib/ai/requests";
import { ReplanResultSchema } from "@/lib/model/plan";

export const maxDuration = 300;
const DEADLINE_MS = 270_000;

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

  return streamJob(async (progress) => {
    progress("reading");
    if (process.env.AI_MOCK === "1") {
      const res = mockReplan(items, vibe, note);
      progress("thinking");
      await pause(100);
      res.items.forEach((_, i) => progress("writing", { count: i + 1 }));
      return { ok: true, data: { ...res, usage: null } };
    }

    progress("thinking");
    const result = await runStructured(
      {
        role: "everyday",
        effort: "medium",
        system: REPLAN_SYSTEM,
        prompt: replanPrompt(describeTrip(trip, inputs, today), day, items, vibe, note),
        schema: ReplanResultSchema,
        maxTokens: 8000,
      },
      { deadlineMs: DEADLINE_MS, onText: onCount("kind", (count) => progress("writing", { count })) }
    );
    if (!result.ok) return result;
    return { ok: true, data: { ...result.data, usage: result.usage } };
  });
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
