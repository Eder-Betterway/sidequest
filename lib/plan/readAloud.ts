import { formatTime, toMinutes } from "@/lib/model/plan";
import { nowAndNext, untilText } from "./today";

/**
 * What "Read today aloud" says: the day, what's on now and next, the rest,
 * and the light. Written to be heard, not read: short sentences, spoken times.
 */
export function todayScript(args: {
  dayNumber: number;
  dayCount: number;
  title: string;
  base: string;
  items: { title: string; start: string | null; end: string | null; place: string | null }[];
  nowMin: number;
  sunset: string | null;
  weather: string | null;
  units: "imperial" | "metric";
  move: { to: string; hours: string } | null;
}): string {
  const t = (s: string | null) => formatTime(s, args.units).replace("am", " a.m.").replace("pm", " p.m.");
  const parts = [`Day ${args.dayNumber} of ${args.dayCount}. ${args.title}, in ${args.base}.`];
  if (args.weather) parts.push(`Weather: ${args.weather}.`);
  const { current, next, later } = nowAndNext(args.items, args.nowMin);
  if (current) parts.push(`Now: ${current.title}${current.end ? `, until ${t(current.end)}` : ""}.`);
  if (next) parts.push(`Next: ${next.title} at ${t(next.start)}, ${untilText(toMinutes(next.start)! - args.nowMin)}.`);
  if (!current && !next) parts.push("Nothing else with a set time today.");
  if (later.length) parts.push(`Later: ${later.map((i) => `${i.title} at ${t(i.start)}`).join(", ")}.`);
  const sunsetMin = toMinutes(args.sunset);
  if (sunsetMin !== null && args.nowMin < sunsetMin) parts.push(`Sunset is at ${t(args.sunset)}.`);
  if (args.move) parts.push(`Tomorrow you move to ${args.move.to}, about ${args.move.hours} of driving.`);
  return parts.join(" ");
}

/** A day of the plan, read in order. */
export function dayScript(title: string, base: string, items: { title: string; start: string | null; place: string | null }[], units: "imperial" | "metric"): string {
  const t = (s: string | null) => formatTime(s, units).replace("am", " a.m.").replace("pm", " p.m.");
  const lines = items.map((i) => `${i.start ? `${t(i.start)}: ` : ""}${i.title}${i.place ? `, at ${i.place}` : ""}.`);
  return [`${title}, in ${base}.`, ...lines].join(" ");
}
