/**
 * Shared checklists for a trip: packing, "van ready before we roll", your own.
 * Lists live at `trips/{id}/lists/{listId}`; each item is its own record at
 * `trips/{id}/listItems/{itemId}`, so both phones can tick things at once,
 * offline, without overwriting each other.
 */

export interface ListDoc {
  title: string;
  /** A list you run every time (van ready): it can be reset. */
  repeat: boolean;
  order: number;
  createdBy: string;
  createdAt: number;
}

export interface ListItemDoc {
  listId: string;
  text: string;
  done: boolean;
  doneBy: string | null;
  order: number;
  updatedAt: number;
}

export interface TripList extends ListDoc {
  id: string;
}
export interface ListItem extends ListItemDoc {
  id: string;
  pending: boolean;
}

export interface Template {
  id: string;
  title: string;
  repeat: boolean;
  items: string[];
  /** Only offered on trips that use these. */
  for?: "campervan";
}

export const TEMPLATES: Template[] = [
  {
    id: "packing",
    title: "Packing",
    repeat: false,
    items: [
      "Layers for cold nights",
      "Rain jacket",
      "Hiking shoes",
      "Sun hat and sunglasses",
      "Sunscreen",
      "Headlamps",
      "Refillable water bottles",
      "First aid kit",
      "Phone chargers and cables",
      "Battery pack",
      "Toiletries",
      "Medications",
      "ID, licenses, insurance cards",
      "Cards and some cash",
      "Offline maps downloaded",
    ],
  },
  {
    id: "van-ready",
    title: "Van ready before we roll",
    repeat: true,
    for: "campervan",
    items: [
      "Water tank topped up",
      "Grey and black tanks dumped (if needed)",
      "Propane off",
      "Fridge latched, cabinets closed",
      "Loose things stowed",
      "Roof vent and pop-top down",
      "Windows closed",
      "Shore power and hoses unplugged",
      "Leveling blocks and chocks packed",
      "Step in, doors locked",
      "Walk around: nothing left behind",
    ],
  },
  {
    id: "arrive-camp",
    title: "Arriving at camp",
    repeat: true,
    for: "campervan",
    items: ["Check site rules and quiet hours", "Level the van", "Chocks in", "Hook up power and water", "Propane on", "Note where the dump and water are"],
  },
  {
    id: "before-leaving",
    title: "Before we leave home",
    repeat: false,
    items: ["Mail held", "Plants watered or sorted", "Trash out", "Thermostat down", "Lights on a timer", "Someone has the plan"],
  },
];

/** Templates worth offering for this trip that aren't added yet. */
export function templatesFor(modes: string[], existingTitles: string[]): Template[] {
  const have = new Set(existingTitles.map((t) => t.toLowerCase()));
  return TEMPLATES.filter((t) => (!t.for || modes.includes(t.for)) && !have.has(t.title.toLowerCase()));
}

export function progress(items: Pick<ListItemDoc, "done">[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

export function sortListItems<T extends Pick<ListItemDoc, "order">>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}
