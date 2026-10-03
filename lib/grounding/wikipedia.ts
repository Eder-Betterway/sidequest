import type { WikiSummary } from "@/lib/model/place";

/**
 * A place's Wikipedia summary, used to ground the history section.
 * Finds the best-matching article first, then its summary. Never throws.
 */

const HEADERS = { "Api-User-Agent": "Sidequest/1.0 (personal trip planner; https://github.com/Eder-Betterway/sidequest)" };

export function parseSummary(body: unknown): WikiSummary | null {
  const b = body as { type?: string; title?: string; extract?: string; content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } } };
  if (!b?.extract || !b.title || b.type === "disambiguation") return null;
  const url = b.content_urls?.mobile?.page ?? b.content_urls?.desktop?.page;
  if (!url) return null;
  return { title: b.title, extract: b.extract, url };
}

export async function wikiSummary(query: string, fetchImpl: typeof fetch = fetch): Promise<WikiSummary | null> {
  try {
    const search = await fetchImpl(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=${encodeURIComponent(query)}`,
      { headers: HEADERS, signal: AbortSignal.timeout(6000) }
    );
    if (!search.ok) return null;
    const hit = ((await search.json()) as { query?: { search?: { title: string }[] } }).query?.search?.[0];
    if (!hit) return null;
    const res = await fetchImpl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(6000),
    });
    return res.ok ? parseSummary(await res.json()) : null;
  } catch {
    return null;
  }
}
