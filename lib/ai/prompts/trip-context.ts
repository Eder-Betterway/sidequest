import { dayCount, type TripInputs } from "@/lib/model/inputs";

/**
 * Turns a trip's dates and wizard answers into a plain-language brief for
 * Claude. Shared by every planning prompt so they all see the trip the same way.
 * Only answers that were actually given are included.
 */
export function describeTrip(
  trip: { title: string; startDate: string; endDate: string },
  inputs: TripInputs,
  today: string
): string {
  const lines: string[] = [];
  const nights = dayCount(trip.startDate, trip.endDate) - 1;
  const add = (label: string, value: string | false | null | undefined) => {
    if (value) lines.push(`- ${label}: ${value}`);
  };

  lines.push(`Trip: "${trip.title}"`);
  add("Dates", `${trip.startDate} to ${trip.endDate} (${nights} nights)${inputs.flexibleDays ? `, flexible by up to ${inputs.flexibleDays} days` : ""}`);
  add("Today's date", today);
  add("Regions to explore", inputs.regions.join("; "));
  add("Starts at", inputs.startPlace);
  add("Ends at", inputs.endPlace);

  if (inputs.milestones.length) {
    lines.push("- Milestones:");
    for (const m of inputs.milestones) {
      const when = m.endDate && m.endDate !== m.date ? `${m.date} to ${m.endDate}` : m.date;
      const buffers = [
        m.bufferBeforeDays ? `arrive ${m.bufferBeforeDays} day(s) early` : "",
        m.bufferAfterDays ? `${m.bufferAfterDays} easy day(s) after` : "",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `  - [${m.priority.toUpperCase()}] ${m.title} (${m.kind}) on ${when}${m.time ? ` at ${m.time}` : ""}${m.place ? ` in ${m.place}` : ""}${buffers ? `; ${buffers}` : ""}${m.notes ? `. ${m.notes}` : ""}`
      );
    }
  }

  add("Getting around (only these)", inputs.modes.join(", "));
  if (inputs.vehicle) {
    const v = inputs.vehicle;
    const specs = [
      v.lengthM && `length ${v.lengthM.toFixed(1)} m`,
      v.heightM && `height ${v.heightM.toFixed(1)} m`,
      v.widthM && `width ${v.widthM.toFixed(1)} m`,
      v.weightT && `weight ${v.weightT.toFixed(1)} t`,
      v.rangeKm && `range ${Math.round(v.rangeKm)} km per tank`,
      v.fourWheelDrive ? "4WD" : "2WD",
      v.offGridNights !== null && `${v.offGridNights} nights off-grid before needing water/dump/power`,
      v.notes,
    ].filter(Boolean);
    add("Vehicle", specs.join(", "));
  }
  add("Max driving per day", inputs.maxDriveHoursPerDay ? `${inputs.maxDriveHoursPerDay} hours` : null);
  add("No driving after dark", inputs.noNightDriving && "yes");
  add("Minimum nights per stop", inputs.minNightsPerStop > 1 ? String(inputs.minNightsPerStop) : null);

  if (inputs.travelers.length) {
    lines.push("- Travelers:");
    for (const t of inputs.travelers) {
      lines.push(`  - ${t.label || "Traveler"}: ${[t.interests.join(", "), t.notes].filter(Boolean).join(". ") || "no specifics"}`);
    }
  }
  add("Shared interests", inputs.sharedInterests.join(", "));
  add("Budget", inputs.budget);
  add("Lodging they like", inputs.lodging.join(", "));
  add("Mornings", inputs.wakeStyle === "normal" ? null : inputs.wakeStyle === "sunrise" ? "sunrise people, early starts welcome" : "like to sleep in");
  add("Rest day", inputs.restEveryNDays ? `every ${inputs.restEveryNDays} days` : null);
  add("Remote work needs", inputs.workDays);
  add("Hard nos", inputs.hardNos);
  add("Must-dos", inputs.mustDos);
  add("Photo goals", inputs.photoGoals);
  add("Weather preference", inputs.weather);
  add("Already booked (fixed)", inputs.alreadyBooked);
  add("Surprise factor", inputs.surpriseMe && "include one unexpected wildcard they wouldn't think of");
  add("Units", inputs.units === "metric" ? "km, °C" : "miles, °F");
  add("Home currency", inputs.homeCurrency);
  add("Other notes", inputs.extraNotes);

  return lines.join("\n");
}
