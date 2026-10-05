import { requireMember } from "@/lib/ai/guard";
import { mockPlaceFacts } from "@/lib/ai/mocks";
import { PlaceFactsRequestSchema, readJson } from "@/lib/ai/requests";
import { holidaysFor } from "@/lib/grounding/holidays";
import { glowNear } from "@/lib/grounding/glow";
import { nightCloudsFor, weatherFor } from "@/lib/grounding/weather";
import { wikiSummary } from "@/lib/grounding/wikipedia";

/**
 * Hard facts about a place for the trip's dates: Wikipedia summary, weather,
 * public holidays, night clouds and town glow for stargazing. All free sources; no AI. Signed-in members only, so this
 * isn't an open proxy.
 */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;
  const body = await readJson(req, PlaceFactsRequestSchema);
  if (!body.ok) return body.response;
  const { place, from, to, today } = body.data;

  if (process.env.AI_MOCK === "1") return Response.json(mockPlaceFacts(place.name, from));

  const at = place.lat !== null && place.lng !== null ? { lat: place.lat, lng: place.lng } : null;
  const [wiki, weather, holidays, nightClouds, glow] = await Promise.all([
    wikiSummary(place.name),
    at ? weatherFor(at.lat, at.lng, from, to, today) : Promise.resolve(null),
    holidaysFor(place.countryCode, from, to),
    at ? nightCloudsFor(at.lat, at.lng, from, to, today) : Promise.resolve([]),
    at ? glowNear(at) : Promise.resolve(null),
  ]);
  return Response.json({ wiki, weather, holidays, nightClouds, glow });
}
