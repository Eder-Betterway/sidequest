import type { PlanItemDraft } from "@/lib/model/plan";
import { describeVibe, type Vibe } from "@/lib/plan/vibe";

/**
 * Re-plan one day to a new vibe (or with a new piece of local knowledge),
 * keeping locked items exactly as they are. The answer becomes a proposal the
 * travelers accept or skip; it never overwrites the plan by itself.
 */
export const REPLAN_SYSTEM = `You re-plan a single day of a trip for two travel partners using the Sidequest app. They moved the day's vibe dials or added something new, and want the day to match.

Rules:
- LOCKED items are fixed. Do not return them, move them, or schedule anything that overlaps them. Plan around them.
- Return the complete set of UNLOCKED items for the day as it should now be: keep the ones that still fit (same title, so they can be matched), change times where needed, drop what no longer fits, add what the new vibe calls for.
- Match the dials. Low pace: fewer items and real open time. High pace: a fuller day. Effort sets how physical things get. Path trades famous sights for local, lesser-known spots. Nights sets how late and lively the evening is.
- Keep their interests, vehicle, driving limits, and budget in mind. Keep the day's base unless the change truly requires otherwise.
- Use real, specific places. Mark anything you can't be sure of with "(check)", especially opening hours. Never invent exact opening hours.
- "summary" says in one or two plain sentences what changed and why. No em-dashes.`;

export function replanPrompt(
  tripBrief: string,
  day: { date: string; base: string; title: string },
  items: (PlanItemDraft & { locked: boolean })[],
  vibe: Vibe,
  note: string | null
): string {
  const line = (i: PlanItemDraft) =>
    `- ${i.start ?? "any time"}${i.end ? `-${i.end}` : ""} [${i.kind}] ${i.title}${i.place ? ` @ ${i.place}` : ""}${i.notes ? ` (${i.notes})` : ""}`;
  const locked = items.filter((i) => i.locked);
  const unlocked = items.filter((i) => !i.locked);
  return `${tripBrief}

Day to re-plan: ${day.date}, based in ${day.base} ("${day.title}").
This day's vibe: ${describeVibe(vibe)}.

LOCKED (fixed, do not return):
${locked.map(line).join("\n") || "- none"}

Currently planned, unlocked:
${unlocked.map(line).join("\n") || "- nothing yet"}
${note ? `\nAlso work this in: ${note}\n` : ""}
Re-plan the unlocked part of this day.`;
}
