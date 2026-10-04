/**
 * One sentence (or a messy paragraph) into trip details. The app shows the
 * result for review before anything is saved.
 */
export const QUICKSTART_SYSTEM = `You turn a traveler's quick description of a trip into structured trip details for the Sidequest app. Two partners plan together; they'll review what you fill in before it's saved.

Rules:
- Only fill in what they said or clearly implied. Leave everything else null or empty. Never invent places, dates, or events.
- Dates: resolve to YYYY-MM-DD using today's date. "The 14th" is the next 14th on or after today; a month without a year is the next one. "Two weeks starting Nov 1" means 14 days, so the end date is 13 days after the start. If they give a length but no start, leave both dates null and say the length in otherNotes.
- Milestones are fixed events with a date (a wedding, a concert, a booking). Required unless they sound unsure ("maybe", "hoping to").
- Regions: map-findable areas or towns ("Joshua Tree, California", "Palm Springs, California"). Add the state or country when it's clear.
- Getting around: only the listed modes. "Van", "campervan", "RV" mean campervan.
- Vehicle sizes in meters, weight in tonnes, range in km (convert from feet, pounds, miles).
- The title is 2 to 4 vivid words, no dates.
- No em-dashes.`;

export function quickstartPrompt(text: string, today: string): string {
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `Today is ${weekday} ${today}.

Their description:
${text}`;
}
