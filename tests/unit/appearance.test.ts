import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { ACCENTS, APPEARANCE_INIT_SCRIPT, DEFAULT_APPEARANCE, isDark, parseAppearance } from "@/lib/appearance";

describe("appearance", () => {
  it("falls back to defaults for anything unknown", () => {
    expect(parseAppearance({})).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ theme: "neon", accent: "chartreuse", text: "huge" })).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ theme: "dark", accent: "ocean", text: "larger" })).toEqual({ theme: "dark", accent: "ocean", text: "larger" });
  });

  it("follows the phone only on match phone", () => {
    expect(isDark("auto", true)).toBe(true);
    expect(isDark("auto", false)).toBe(false);
    expect(isDark("light", true)).toBe(false);
    expect(isDark("dark", false)).toBe(true);
  });

  it("has distinct accents with light and dark versions", () => {
    expect(new Set(ACCENTS.map((a) => a.id)).size).toBe(ACCENTS.length);
    for (const a of ACCENTS) {
      for (const c of [a.light.accent, a.light.soft, a.dark.accent, a.dark.soft]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  // The head script runs before React: it must work on its own, and never throw.
  function runScript(stored: Record<string, string>, systemDark: boolean) {
    const props: Record<string, string> = {};
    const attrs: Record<string, string> = {};
    const root = { style: { setProperty: (k: string, v: string) => (props[k] = v), fontSize: "" }, setAttribute: (k: string, v: string) => (attrs[k] = v) };
    runInNewContext(APPEARANCE_INIT_SCRIPT, {
      localStorage: { getItem: (k: string) => stored[k] ?? null },
      window: { matchMedia: () => ({ matches: systemDark }) },
      document: { documentElement: root },
    });
    return { theme: attrs["data-theme"], accent: props["--accent"], soft: props["--accent-soft"], size: root.style.fontSize };
  }

  it("applies saved choices before first paint", () => {
    const ocean = ACCENTS.find((a) => a.id === "ocean")!;
    expect(runScript({ sidequest_theme: "dark", sidequest_accent: "ocean", sidequest_text: "larger" }, false)).toEqual({
      theme: "dark",
      accent: ocean.dark.accent,
      soft: ocean.dark.soft,
      size: "125%",
    });
    expect(runScript({}, true)).toMatchObject({ theme: "dark", accent: ACCENTS[0].dark.accent, size: "100%" });
    expect(runScript({ sidequest_theme: "light" }, true)).toMatchObject({ theme: "light", accent: ACCENTS[0].light.accent });
    expect(runScript({ sidequest_accent: "nope" }, false)).toMatchObject({ accent: ACCENTS[0].light.accent });
  });

  it("never throws, even when storage is blocked", () => {
    expect(() =>
      runInNewContext(APPEARANCE_INIT_SCRIPT, {
        localStorage: {
          getItem: () => {
            throw new Error("blocked");
          },
        },
        window: {},
        document: {},
      })
    ).not.toThrow();
  });
});
