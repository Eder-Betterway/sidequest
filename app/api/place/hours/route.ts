import { requireMember } from "@/lib/ai/guard";
import { mockHours } from "@/lib/ai/mocks";
import { HoursRequestSchema, readJson } from "@/lib/ai/requests";
import { hoursFor } from "@/lib/grounding/places";

/** Live opening hours from Google Places, or a "check hours" link when no key is set. */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;
  const body = await readJson(req, HoursRequestSchema);
  if (!body.ok) return body.response;
  if (process.env.AI_MOCK === "1") return Response.json(mockHours(body.data.query));
  return Response.json(await hoursFor(body.data.query, body.data.near));
}
