import { requireMember } from "@/lib/ai/guard";
import { runStructured } from "@/lib/ai/claude";
import { mockFlyer } from "@/lib/ai/mocks";
import { FLYER_SYSTEM, flyerPrompt } from "@/lib/ai/prompts/flyer";
import { FlyerRequestSchema, readJson } from "@/lib/ai/requests";
import { FlyerResultSchema } from "@/lib/model/note";

export const maxDuration = 60;

/** Read the events off a flyer photo (Haiku with vision). The photo isn't kept. */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;
  const body = await readJson(req, FlyerRequestSchema);
  if (!body.ok) return body.response;
  const { trip, image, mediaType, near, today } = body.data;

  if (process.env.AI_MOCK === "1") return Response.json({ ...mockFlyer(trip.startDate), usage: null });

  const result = await runStructured({
    role: "quick",
    effort: "low",
    system: FLYER_SYSTEM,
    prompt: flyerPrompt(trip, today, near),
    images: [{ mediaType, data: image }],
    schema: FlyerResultSchema,
    maxTokens: 3000,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ...result.data, usage: result.usage });
}
