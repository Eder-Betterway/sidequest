import type { PlanItemDraft } from "@/lib/model/plan";

/**
 * Change the trip from a plain request ("Stay in Palm Springs through the
 * 14th for the wedding", "Head to Joshua Tree on the 12th"). Can move where
 * they sleep across several days. Comes back as a suggestion they accept or
 * skip day by day.
 */
export const REROUTE_SYSTEM = `You adjust a multi-day trip for two travel partners in the Sidequest app. They tell you what they want changed, in plain words. You return only the days that need to change.

Rules:
- Do what they asked. If it's tied to a day, that day matters most, but change neighboring days when the request needs it (staying longer somewhere means arriving later at the next stop; heading somewhere new means a drive day).
- Change as few days as possible. Days that don't need to change are not returned.
- For each changed day return: "base" (where they sleep that night, map-findable, e.g. "Palm Springs, California"), a short "title", and the COMPLETE list of that day's UNLOCKED items in time order. Keep existing unlocked items that still fit with the exact same title so they can be matched.
- LOCKED items are fixed (bookings, milestones like a wedding). Never return them, never move them, never plan anything overlapping them, and never move a day's base away from where its locked items happen.
- Respect their rules, max driving hours, no-night-driving, vehicle, budget, and vibe. Add a "drive" item for travel days, with a realistic duration.
- Use the weather when it helps: outdoor highlights on good-weather days, slack on stormy ones. Last year's weather is only a guide.
- Use real, specific places. Mark anything you can't be sure of with "(check)". Never invent opening hours.
- "summary": one to three plain sentences on what you changed and why. No em-dashes.`;

type Day = { date: string; base: string; title: string; items: (PlanItemDraft & { locked: boolean })[] };

export function reroutePrompt(tripBrief: string, days: Day[], instruction: string, focusDate: string | null, weather: string): string {
  const line = (i: PlanItemDraft & { locked: boolean }) =>
    `    - ${i.locked ? "LOCKED " : ""}${i.start ?? "any time"}${i.end ? `-${i.end}` : ""} [${i.kind}] ${i.title}${i.place ? ` @ ${i.place}` : ""}`;
  const plan = days.map((d) => `- ${d.date}: ${d.base} ("${d.title}")\n${d.items.map(line).join("\n") || "    - nothing planned"}`).join("\n");
  return `${tripBrief}

The plan as it stands:
${plan}
${weather ? `\nWeather by stop:\n${weather}\n` : ""}
What they want${focusDate ? ` (asked from ${focusDate})` : ""}: ${instruction}

Return only the days that change.`;
}
