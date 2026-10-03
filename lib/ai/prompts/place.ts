import type { WikiSummary } from "@/lib/model/place";

/**
 * Place deep-dive, step 1: research with web search and write notes with
 * citations. Step 2 (a smaller model) turns the notes into the app's format.
 */
export const RESEARCH_SYSTEM = `You research a place for two travel partners using the Sidequest app, so they know what makes it special and how to get the most from it on their dates.

Write plain notes under these headings: Summary, History, Highlights, Tips, Best times, Happening during their dates.
- Tie highlights and tips to their interests and vibe.
- Use web search for anything current: events, festivals, markets, live music, seasonal closures, road or trail closures, permits or timed entry during their dates. Search at most a few times.
- History can draw on the Wikipedia summary provided; keep it vivid and short.
- Never state exact opening hours; say "check hours" instead. The app gets hours from Google separately.
- If you find nothing happening during their dates, say so plainly.
- No em-dashes.`;

export function researchPrompt(
  place: string,
  tripBrief: string,
  from: string,
  to: string,
  wiki: WikiSummary | null
): string {
  return `${tripBrief}

Place: ${place}
They're here from ${from} to ${to}.
${wiki ? `\nWikipedia (${wiki.title}): ${wiki.extract}\n` : ""}
Research this place for them.`;
}

export const STRUCTURE_SYSTEM = `You turn research notes about a travel destination into the Sidequest app's format. Use only what the notes say; don't add facts. Keep the warm, plain tone. No em-dashes. For each "happening" item, use a source URL from the list when it clearly matches, else null.`;

export function structurePrompt(notes: string, sources: { title: string; url: string }[]): string {
  return `Notes:
${notes}

Sources found:
${sources.map((s, i) => `${i + 1}. ${s.title}: ${s.url}`).join("\n") || "none"}`;
}
