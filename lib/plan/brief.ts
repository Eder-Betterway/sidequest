/**
 * A compact, plain-text view of the plan for prompts that need the whole trip
 * (questions), without sending every field of every item.
 */

export interface AskDay {
  date: string;
  base: string;
  title: string;
  items: { start: string | null; title: string; place: string | null; locked: boolean }[];
}

export function formatAskPlan(days: AskDay[]): string {
  return days
    .map((d) => {
      const items = d.items
        .map((i) => `  - ${i.start ?? "any time"} ${i.title}${i.place ? ` @ ${i.place}` : ""}${i.locked ? " (locked)" : ""}`)
        .join("\n");
      return `- ${d.date}, ${d.base}: ${d.title}${items ? `\n${items}` : ""}`;
    })
    .join("\n");
}

/** Up to a few items per day, in time order, never hiding milestones or locked bookings. */
export function previewItems<T extends { kind: string; locked: boolean }>(items: T[], max = 4): T[] {
  const must = new Set(items.filter((i) => i.kind === "milestone" || i.locked));
  let room = Math.max(0, max - must.size);
  return items.filter((i) => must.has(i) || room-- > 0);
}
