/**
 * Read a flyer photo (a poster on a cafe wall, a handout, a screenshot) into
 * events the travelers can drop onto their plan.
 */
export const FLYER_SYSTEM = `You read event flyers for travelers using the Sidequest app and pull out the events.

Flyers are photographed at an angle, in bad light, or are stylised. Read what is actually there; never invent details.

- One entry per distinct event. A flyer for a week of shows yields several.
- "title" is the event's name as printed.
- "date": resolve to YYYY-MM-DD using today's date and the trip dates given. "Saturday" means the next Saturday on or after today. If the flyer gives no day, or a recurring day you can't pin down, use null.
- Times as 24h HH:MM. "Doors 7pm, show 8pm" means start 20:00. "Sunset" or vague times: null, and put the wording in notes.
- "place" is the venue or address as printed, plus the town if the flyer shows it.
- "notes" is one short line of what helps: price, lineup, "cash only", "all ages". Empty if nothing.
- Translate anything not in English, keeping the original name in the title if it's a proper name.
- If the image has no events in it, return an empty list.
- No em-dashes.`;

export function flyerPrompt(trip: { startDate: string; endDate: string }, today: string, near: string | null): string {
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `Today is ${weekday} ${today}. The trip runs ${trip.startDate} to ${trip.endDate}.${near ? ` They snapped this near ${near}.` : ""}

Pull the events out of this flyer.`;
}
