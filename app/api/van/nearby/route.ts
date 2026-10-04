import { requireMember } from "@/lib/ai/guard";
import { mockSpots } from "@/lib/ai/mocks";
import { NearbyRequestSchema, readJson } from "@/lib/ai/requests";
import { spotsNear } from "@/lib/grounding/overpass";

export const maxDuration = 60;

/** Places to sleep and restock near a night's base, from OpenStreetMap. No AI. */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;
  const body = await readJson(req, NearbyRequestSchema);
  if (!body.ok) return body.response;
  const { place } = body.data;

  if (process.env.AI_MOCK === "1") return Response.json({ spots: mockSpots(place) });
  const spots = await spotsNear(place);
  if (!spots) return Response.json({ error: "The map service is busy. Try again in a minute." }, { status: 502 });
  return Response.json({ spots });
}
