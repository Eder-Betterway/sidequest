import { addDays, dayCount, type Milestone } from "@/lib/model/inputs";
import type { DayDraft, PlanItemDraft, TripOption } from "@/lib/model/plan";

/**
 * Pure planning helpers: which stop each night is at, how to split a trip into
 * chunks for Claude, and how milestones get pinned into the plan.
 */

/** Every date of the trip with the stop you sleep at that night (the last day is departure day). */
export function stopsByDate(option: TripOption, startDate: string, endDate: string): { date: string; stop: string }[] {
  const days = dayCount(startDate, endDate);
  const nightly: string[] = [];
  for (const s of option.route) for (let i = 0; i < s.nights; i++) nightly.push(s.place);
  const fallback = option.route[option.route.length - 1]?.place ?? "";
  const out: { date: string; stop: string }[] = [];
  for (let i = 0; i < days; i++) {
    // Nights may not add up exactly; pad with the last stop rather than fail.
    const stop = nightly[i] ?? nightly[nightly.length - 1] ?? fallback;
    out.push({ date: addDays(startDate, i), stop });
  }
  return out;
}

/** Split a date range into consecutive chunks of at most `size` days. */
export function chunkDates(startDate: string, endDate: string, size: number): { from: string; to: string }[] {
  const total = dayCount(startDate, endDate);
  const out: { from: string; to: string }[] = [];
  for (let i = 0; i < total; i += size) {
    out.push({ from: addDays(startDate, i), to: addDays(startDate, Math.min(i + size, total) - 1) });
  }
  return out;
}

/** Keep only one entry per expected date, in order, filling any the model skipped. */
export function normalizeDays(drafts: DayDraft[], dates: { date: string; stop: string }[]): DayDraft[] {
  const byDate = new Map<string, DayDraft>();
  for (const d of drafts) if (!byDate.has(d.date)) byDate.set(d.date, d);
  return dates.map(
    ({ date, stop }) => byDate.get(date) ?? { date, base: stop, title: "Open day", items: [] }
  );
}

export interface PinnedItem extends PlanItemDraft {
  locked: boolean;
  source: "ai" | "milestone";
  milestoneId: string | null;
}

/**
 * Every milestone on a planned day becomes a locked item. If Claude already
 * put it in (matched by title), that item is locked and linked; otherwise one
 * is added. Locked items never move when re-planning.
 */
export function pinMilestones(day: DayDraft, milestones: Milestone[]): PinnedItem[] {
  const items: PinnedItem[] = day.items.map((it) => ({ ...it, locked: false, source: "ai", milestoneId: null }));
  const norm = (s: string) => s.trim().toLowerCase();

  for (const m of milestones) {
    const last = m.endDate ?? m.date;
    if (day.date < m.date || day.date > last) continue;
    const hit = items.find((it) => it.milestoneId === null && norm(it.title).includes(norm(m.title)));
    if (hit) {
      Object.assign(hit, { kind: "milestone" as const, locked: true, source: "milestone" as const, milestoneId: m.id });
      if (!hit.start && m.time && day.date === m.date) hit.start = m.time;
    } else {
      items.push({
        kind: "milestone",
        title: m.title,
        start: day.date === m.date ? m.time : null,
        end: null,
        place: m.place || null,
        notes: m.notes,
        locked: true,
        source: "milestone",
        milestoneId: m.id,
      });
    }
  }
  return items;
}

/** The run of consecutive days spent at the same base as `date`. */
export function stayRange(days: { date: string; base: string }[], date: string): { from: string; to: string } {
  const i = days.findIndex((d) => d.date === date);
  if (i < 0) return { from: date, to: date };
  let a = i;
  let b = i;
  while (a > 0 && days[a - 1].base === days[i].base) a--;
  while (b < days.length - 1 && days[b + 1].base === days[i].base) b++;
  return { from: days[a].date, to: days[b].date };
}
