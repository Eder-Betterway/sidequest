import { describe, expect, it } from "vitest";
import { progress, sortListItems, TEMPLATES, templatesFor } from "@/lib/model/lists";

describe("checklists", () => {
  it("offers van lists only on van trips, and not twice", () => {
    expect(templatesFor(["car"], []).map((t) => t.id)).toEqual(["packing", "before-leaving"]);
    expect(templatesFor(["campervan"], ["Packing"]).map((t) => t.id)).toEqual(["van-ready", "arrive-camp", "before-leaving"]);
  });

  it("counts what's done and keeps the order", () => {
    expect(progress([{ done: true }, { done: false }, { done: true }])).toEqual({ done: 2, total: 3 });
    expect(sortListItems([{ order: 2 }, { order: 0 }, { order: 1 }]).map((i) => i.order)).toEqual([0, 1, 2]);
  });

  it("has repeatable van lists and sensible starter items", () => {
    const van = TEMPLATES.find((t) => t.id === "van-ready")!;
    expect(van.repeat).toBe(true);
    expect(van.items).toContain("Propane off");
    for (const t of TEMPLATES) expect(new Set(t.items).size).toBe(t.items.length);
  });
});
