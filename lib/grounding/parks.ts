import { haversineKm, type LatLng } from "@/lib/model/van";

/**
 * US public lands near a stop:
 * - National Park Service: the park the stop is in or next to, with its live
 *   alerts (closures, dangers, cautions). Needs NPS_API_KEY (free).
 * - Recreation.gov (RIDB): reservable campgrounds nearby, each with its
 *   booking page. Needs RIDB_API_KEY (free).
 * Without a key, that half is skipped and the app shows a search link instead.
 */

export interface ParkAlert {
  title: string;
  category: string;
  description: string;
  url: string | null;
}

export interface ParksInfo {
  park: { name: string; code: string; url: string; km: number; alerts: ParkAlert[] } | null;
  campgrounds: { id: string; name: string; url: string; km: number }[];
  /** Which sources were looked up, so the app can say what's missing. */
  checked: { nps: boolean; ridb: boolean };
}

const NPS = "https://developer.nps.gov/api/v1";
const RIDB = "https://ridb.recreation.gov/api/v1";
/** A park this far from the stop still counts as "here". */
const PARK_KM = 60;
const CAMP_KM = 40;
const CAMPING_ACTIVITY = 9;

/** "Joshua Tree, California" -> "Joshua Tree". */
export function searchTerm(name: string): string {
  return name.split(",")[0].replace(/\b(national park|np)\b/gi, "").trim() || name;
}

interface NpsPark {
  fullName?: string;
  parkCode?: string;
  url?: string;
  latitude?: string;
  longitude?: string;
}

export function nearestPark(parks: NpsPark[], at: LatLng): { name: string; code: string; url: string; km: number } | null {
  const near = parks
    .map((p) => ({ p, lat: Number(p.latitude), lng: Number(p.longitude) }))
    .filter(({ p, lat, lng }) => p.parkCode && p.fullName && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0))
    .map(({ p, lat, lng }) => ({ name: p.fullName!, code: p.parkCode!, url: p.url || `https://www.nps.gov/${p.parkCode}/`, km: Math.round(haversineKm(at, { lat, lng })) }))
    .filter((p) => p.km <= PARK_KM)
    .sort((a, b) => a.km - b.km);
  return near[0] ?? null;
}

/** Closures and dangers first; the text trimmed for a phone. */
export function parseAlerts(data: { title?: string; category?: string; description?: string; url?: string }[]): ParkAlert[] {
  const order = ["Park Closure", "Danger", "Caution", "Information"];
  const rank = (c: string) => (order.indexOf(c) < 0 ? order.length : order.indexOf(c));
  return data
    .filter((a) => a.title)
    .map((a) => ({
      title: a.title!.trim(),
      category: a.category?.trim() || "Information",
      description: (a.description ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 400),
      url: a.url?.startsWith("https://") ? a.url : null,
    }))
    .sort((a, b) => rank(a.category) - rank(b.category))
    .slice(0, 8);
}

interface RidbFacility {
  FacilityID?: string | number;
  FacilityName?: string;
  FacilityTypeDescription?: string;
  Reservable?: boolean;
  FacilityLatitude?: number;
  FacilityLongitude?: number;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function parseCampgrounds(data: RidbFacility[], at: LatLng): ParksInfo["campgrounds"] {
  return data
    .filter((f) => f.FacilityID && f.FacilityName && f.Reservable && /campground/i.test(f.FacilityTypeDescription ?? "campground"))
    .map((f) => ({
      id: String(f.FacilityID),
      // RIDB names are often ALL CAPS.
      name: f.FacilityName === f.FacilityName!.toUpperCase() ? titleCase(f.FacilityName!) : f.FacilityName!,
      url: `https://www.recreation.gov/camping/campgrounds/${f.FacilityID}`,
      km: typeof f.FacilityLatitude === "number" && typeof f.FacilityLongitude === "number" ? Math.round(haversineKm(at, { lat: f.FacilityLatitude, lng: f.FacilityLongitude })) : CAMP_KM,
    }))
    .filter((c) => c.km <= CAMP_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, 8);
}

async function getJson(url: string, headers: Record<string, string>, fetchImpl: typeof fetch): Promise<unknown | null> {
  try {
    const res = await fetchImpl(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.error("Parks lookup", res.status, url.split("?")[0]);
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

export async function parksNear(
  place: { name: string; lat: number; lng: number; countryCode: string | null },
  keys: { nps?: string; ridb?: string } = { nps: process.env.NPS_API_KEY, ridb: process.env.RIDB_API_KEY },
  fetchImpl: typeof fetch = fetch
): Promise<ParksInfo | null> {
  if (place.countryCode !== "US") return null;
  const at = { lat: place.lat, lng: place.lng };

  const npsPart = async () => {
    if (!keys.nps) return null;
    const h = { "X-Api-Key": keys.nps };
    const parks = (await getJson(`${NPS}/parks?limit=20&q=${encodeURIComponent(searchTerm(place.name))}`, h, fetchImpl)) as { data?: NpsPark[] } | null;
    const park = nearestPark(parks?.data ?? [], at);
    if (!park) return null;
    const alerts = (await getJson(`${NPS}/alerts?limit=30&parkCode=${park.code}`, h, fetchImpl)) as { data?: Parameters<typeof parseAlerts>[0] } | null;
    return { ...park, alerts: parseAlerts(alerts?.data ?? []) };
  };

  const ridbPart = async () => {
    if (!keys.ridb) return [];
    const body = (await getJson(
      `${RIDB}/facilities?latitude=${at.lat}&longitude=${at.lng}&radius=${Math.round(CAMP_KM * 0.621)}&activity=${CAMPING_ACTIVITY}&limit=50`,
      { apikey: keys.ridb },
      fetchImpl
    )) as { RECDATA?: RidbFacility[] } | null;
    return parseCampgrounds(body?.RECDATA ?? [], at);
  };

  const [park, campgrounds] = await Promise.all([npsPart(), ridbPart()]);
  return { park, campgrounds, checked: { nps: Boolean(keys.nps), ridb: Boolean(keys.ridb) } };
}

/** Recreation.gov's own search, for when there's no RIDB key or nothing came back. */
export function recGovSearchUrl(name: string): string {
  return `https://www.recreation.gov/search?${new URLSearchParams({ q: searchTerm(name) })}`;
}
