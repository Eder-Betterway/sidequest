import type { Vehicle } from "@/lib/model/inputs";
import { estimateLeg, routeProfile, type LatLng } from "@/lib/model/van";

/**
 * Drive time between two stops. With an OpenRouteService key it's real road
 * routing that respects the van's height, width, length, and weight (truck
 * profile for big rigs). Without one, or if ORS fails, a padded straight-line
 * estimate, labeled as such.
 */

export function orsBody(from: LatLng, to: LatLng, v: Vehicle | null) {
  const hgv = routeProfile(v) === "driving-hgv";
  const restrictions = v
    ? Object.fromEntries(
        Object.entries({ height: v.heightM, width: v.widthM, length: v.lengthM, weight: v.weightT }).filter(([, x]) => x !== null)
      )
    : {};
  return {
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    ...(hgv && Object.keys(restrictions).length ? { options: { vehicle_type: "hgv", profile_params: { restrictions } } } : {}),
  };
}

export async function driveBetween(
  from: LatLng,
  to: LatLng,
  v: Vehicle | null
): Promise<{ km: number; hours: number; source: "route" | "estimate"; profile: string }> {
  const profile = routeProfile(v);
  const key = process.env.ORS_API_KEY;
  if (key) {
    try {
      const res = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}`, {
        method: "POST",
        headers: { authorization: key, "content-type": "application/json" },
        body: JSON.stringify(orsBody(from, to, v)),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { routes?: { summary?: { distance?: number; duration?: number } }[] };
        const s = json.routes?.[0]?.summary;
        if (s?.distance && s.duration) {
          // Car routing assumes car speeds; a loaded van is a bit slower.
          const slow = profile === "driving-car" ? 1.1 : 1;
          return {
            km: Math.round(s.distance / 1000),
            hours: Math.round(((s.duration * slow) / 3600) * 10) / 10,
            source: "route",
            profile,
          };
        }
      } else {
        console.error("OpenRouteService", res.status);
      }
    } catch (err) {
      console.error("OpenRouteService failed", err);
    }
  }
  return { ...estimateLeg(from, to), source: "estimate", profile: `${profile}-estimate` };
}
