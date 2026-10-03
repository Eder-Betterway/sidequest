import type { TripOption } from "@/lib/model/plan";

/**
 * Step 2: turn the chosen option into a day-by-day plan. Called in chunks of a
 * few days so each call stays quick; every chunk sees the whole trip for context.
 */
export const EXPAND_SYSTEM = `You turn a chosen trip route into a day-by-day plan for two travel partners using the Sidequest app. The plan lives on their phones and gets edited on the road, so make it practical.

For each day:
- "base" is where they sleep that night (or the main area), map-findable.
- Items in time order, with local 24h times when timing matters (sunrise hikes, reservations, drives, golden hour) and null when it doesn't.
- Include drives as "drive" items with a realistic duration, respecting their vehicle and daily driving limit.
- Include meals as "meal" items where a good spot matters; leave other meals out.
- Leave breathing room. A chill-leaning trip gets fewer items and "free" blocks.
- Milestones from the brief that fall on a day must appear as a "milestone" item with the exact milestone title, at the right time, plus any travel to get there.
- Use the evening for sunset spots when photography or views are an interest.
- Put one practical tip in "notes" when it helps (book ahead, parking fills by 8am, cash only). Mark anything you can't be sure of with "(check)", especially opening hours, closures, and prices. Never invent exact opening hours.
- Use real, specific places. No em-dashes.`;

export function expandPrompt(
  tripBrief: string,
  option: TripOption,
  stopsByDate: { date: string; stop: string }[],
  fromDate: string,
  toDate: string
): string {
  const route = option.route.map((s, i) => `${i + 1}. ${s.place} (${s.nights} nights): ${s.why}`).join("\n");
  const schedule = stopsByDate.map((d) => `${d.date}: sleeping in or near ${d.stop}`).join("\n");
  return `${tripBrief}

Chosen option: "${option.title}". ${option.pitch}
Route:
${route}

Where they sleep each night:
${schedule}

Plan the days from ${fromDate} to ${toDate}, inclusive. Return exactly one entry per date in that range.`;
}
