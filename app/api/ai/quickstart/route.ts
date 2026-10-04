import { requireMember } from "@/lib/ai/guard";
import { runStructured } from "@/lib/ai/claude";
import { mockQuickStart } from "@/lib/ai/mocks";
import { QUICKSTART_SYSTEM, quickstartPrompt } from "@/lib/ai/prompts/quickstart";
import { QuickStartRequestSchema, readJson } from "@/lib/ai/requests";
import { QuickStartSchema } from "@/lib/model/quickstart";

export const maxDuration = 60;

/** Turn a description of a trip into trip details to review. Nothing is saved here. */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;
  const body = await readJson(req, QuickStartRequestSchema);
  if (!body.ok) return body.response;
  const { text, today } = body.data;

  if (process.env.AI_MOCK === "1") return Response.json({ start: mockQuickStart(today), usage: null });

  const result = await runStructured({
    role: "everyday",
    effort: "low",
    system: QUICKSTART_SYSTEM,
    prompt: quickstartPrompt(text, today),
    schema: QuickStartSchema,
    maxTokens: 4000,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ start: result.data, usage: result.usage });
}
