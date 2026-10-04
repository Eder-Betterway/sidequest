import { requireMember } from "@/lib/ai/guard";
import { mockLeg } from "@/lib/ai/mocks";
import { LegRequestSchema, readJson } from "@/lib/ai/requests";
import { driveBetween } from "@/lib/grounding/route";

/** Drive time and distance between two bases, van-aware when the ORS key is set. No AI. */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;
  const body = await readJson(req, LegRequestSchema);
  if (!body.ok) return body.response;
  const { from, to, vehicle } = body.data;

  if (process.env.AI_MOCK === "1") return Response.json(mockLeg());
  return Response.json(await driveBetween(from, to, vehicle));
}
