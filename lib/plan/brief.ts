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
