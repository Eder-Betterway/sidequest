import { sortItems, type StoredDay, type StoredItem } from "@/lib/model/plan";

/**
 * The trip as a calendar file (.ics) that Apple, Google, and Outlook calendars
 * can import: one all-day event per day with the whole plan in its notes,
 * plus an event for everything that has a start time. Times are the stop's
 * local time, so they land right whatever time zone the phone is in.
 */

const TIME = /^(\d{2}):(\d{2})$/;

/** Text values escape backslash, semicolon, comma, and newlines. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 bytes continue on the next line after a space. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** Minutes a time zone is ahead of UTC at a given moment. */
function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60000);
}

/** "2026-11-03" + "20:00" in a place's zone, as a UTC moment. */
export function zonedToUtc(date: string, time: string, timeZone: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetMinutes(guess, timeZone) * 60000;
  // Around a daylight-saving switch the offset can differ at the real moment.
  return guess - offsetMinutes(first, timeZone) * 60000;
}

const pad = (n: number) => String(n).padStart(2, "0");
const utcStamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
};
const dateValue = (iso: string) => iso.replace(/-/g, "");
const nextDate = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

function validZone(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Start and end as iCalendar values: UTC when the stop's zone is known, else "floating" (phone time). */
function times(date: string, start: string, end: string | null, tz: string | undefined): { start: string; end: string } {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let endDate = date;
  let endTime = end && TIME.test(end) ? end : null;
  if (!endTime) {
    const m = toMin(start) + 60;
    endTime = `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
    if (m >= 24 * 60) endDate = nextDate(date);
  } else if (toMin(endTime) <= toMin(start)) {
    endDate = nextDate(date); // runs past midnight
  }
  if (validZone(tz)) return { start: utcStamp(zonedToUtc(date, start, tz)), end: utcStamp(zonedToUtc(endDate, endTime, tz)) };
  const floating = (d: string, t: string) => `${dateValue(d)}T${t.replace(":", "")}00`;
  return { start: floating(date, start), end: floating(endDate, endTime) };
}

function itemLine(i: StoredItem): string {
  return `${i.start ? `${i.start} ` : ""}${i.kind === "milestone" ? "★ " : ""}${i.title}`;
}

export function buildIcs(
  trip: { id: string; title: string },
  days: Pick<StoredDay, "date" | "base" | "title" | "place">[],
  items: StoredItem[],
  now: number
): string {
  const stamp = utcStamp(now);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sidequest//Trip planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(trip.title)}`];
  const event = (fields: string[]) => lines.push("BEGIN:VEVENT", ...fields, "END:VEVENT");

  days.forEach((d, n) => {
    const dayItems = sortItems(items.filter((i) => i.dayDate === d.date));
    const notes = dayItems.map(itemLine).join("\n");
    event([
      `UID:day-${d.date}-${trip.id}@sidequest`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateValue(d.date)}`,
      `DTEND;VALUE=DATE:${dateValue(nextDate(d.date))}`,
      `SUMMARY:${escapeText(`Day ${n + 1}: ${d.title} (${d.base})`)}`,
      `LOCATION:${escapeText(d.base)}`,
      ...(notes ? [`DESCRIPTION:${escapeText(notes)}`] : []),
      "TRANSP:TRANSPARENT",
    ]);
    for (const i of dayItems) {
      if (!i.start || !TIME.test(i.start)) continue;
      const t = times(d.date, i.start, i.end, d.place?.timezone);
      event([
        `UID:item-${i.id}-${trip.id}@sidequest`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${t.start}`,
        `DTEND:${t.end}`,
        `SUMMARY:${escapeText(i.kind === "milestone" ? `★ ${i.title}` : i.title)}`,
        `LOCATION:${escapeText(i.place || d.base)}`,
        ...(i.notes ? [`DESCRIPTION:${escapeText(i.notes)}`] : []),
      ]);
    }
  });

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function icsFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "trip"}.ics`;
}
