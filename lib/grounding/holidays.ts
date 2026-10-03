import type { Holiday } from "@/lib/model/place";

/**
 * Public holidays during the trip (Nager.Date, free, no key), so closures and
 * crowds don't come as a surprise. Covers most countries; never throws.
 */

export function holidaysInRange(list: { date: string; localName?: string; name?: string }[], from: string, to: string): Holiday[] {
  const seen = new Set<string>();
  return list
    .filter((h) => h.date >= from && h.date <= to)
    .map((h) => ({ date: h.date, name: h.name && h.localName && h.name !== h.localName ? `${h.name} (${h.localName})` : (h.name ?? h.localName ?? "Holiday") }))
    .filter((h) => {
      const k = `${h.date}|${h.name}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export async function holidaysFor(countryCode: string | null, from: string, to: string, fetchImpl: typeof fetch = fetch): Promise<Holiday[]> {
  if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return [];
  const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])];
  try {
    const lists = await Promise.all(
      years.map(async (y) => {
        const res = await fetchImpl(`https://date.nager.at/api/v3/PublicHolidays/${y}/${countryCode.toUpperCase()}`, {
          signal: AbortSignal.timeout(6000),
        });
        return res.ok ? ((await res.json()) as { date: string; localName?: string; name?: string }[]) : [];
      })
    );
    return holidaysInRange(lists.flat(), from, to);
  } catch {
    return [];
  }
}
