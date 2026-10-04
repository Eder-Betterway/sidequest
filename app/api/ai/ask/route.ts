import { requireMember } from "@/lib/ai/guard";
import { mockAnswer } from "@/lib/ai/mocks";
import { ASK_SYSTEM, askPrompt } from "@/lib/ai/prompts/ask";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { AskRequestSchema, readJson } from "@/lib/ai/requests";
import { research } from "@/lib/ai/research";

export const maxDuration = 300;

/**
 * Answer a question with the trip, plan, and notes in mind. Sonnet searches the
 * web for anything current; sources come from its citations.
 */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;
  const body = await readJson(req, AskRequestSchema);
  if (!body.ok) return body.response;
  const { trip, inputs, question, dayDate, days, notes, today } = body.data;

  if (process.env.AI_MOCK === "1") return Response.json({ ...mockAnswer(question), usage: null });

  const result = await research(ASK_SYSTEM, askPrompt(describeTrip(trip, inputs, today), question, dayDate, days, notes), 3);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ text: result.notes, sources: result.sources, usage: result.usage });
}
