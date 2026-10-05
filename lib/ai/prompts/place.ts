import type { WikiSummary } from "@/lib/model/place";

/**
 * Place deep-dive, step 1: research with web search and write notes with
 * citations. Step 2 (a smaller model) turns the notes into the app's format.
 */
export const RESEARCH_SYSTEM = `You research a place for two travel partners using the Sidequest app, so they know what makes it special and how to get the most from it on their dates.

Write plain notes under these headings: Summary, History, Highlights, Tips, Best times, Happening during their dates, Where to eat, Book ahead.
- Tie highlights and tips to their interests and vibe.
- Use web search for anything current: events, festivals, markets, live music, seasonal closures, road or trail closures, permits or timed entry during their dates. Search at most a few times.
- History can draw on the Wikipedia summary provided; keep it vivid and short.
- Never state exact opening hours; say "check hours" instead. The app gets hours from Google separately.
- If you find nothing happening during their dates, say so plainly.
- Where to eat: 3 to 6 real, currently open local spots (coffee, a good meal, drinks, a grocery or market stop if they camp), matched to their budget and anything they said about food. Name each exactly as it appears on a map. Prefer local favorites over chains.
- Book ahead: only what truly needs a reservation, permit, or timed ticket on their dates (popular campgrounds, timed park entry, permits, hot springs or tour slots, a restaurant that books out). Say how far ahead and where to book, with the official link. If nothing needs booking, say so.
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

export const STRUCTURE_SYSTEM = `You turn research notes about a travel destination into the Sidequest app's format. Use only what the notes say; don't add facts. Keep the warm, plain tone. No em-dashes. For each "happening" and "bookAhead" item, use a source URL from the list when it clearly matches, else null. Prefer official links (government, park, or the business itself) for bookAhead.`;

export function structurePrompt(notes: string, sources: { title: string; url: string }[]): string {
  return `Notes:
${notes}

Sources found:
${sources.map((s, i) => `${i + 1}. ${s.title}: ${s.url}`).join("\n") || "none"}`;
}
