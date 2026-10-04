/**
 * Appearance, per phone: light/dark/match phone, accent color, and text size.
 * Stored in localStorage (losing it just means defaults) and applied before
 * the first paint by an inline script, so the app never flashes the wrong
 * colors at night.
 */

export type ThemeChoice = "auto" | "light" | "dark";
export type TextSize = "normal" | "large" | "larger";

export interface Accent {
  id: string;
  name: string;
  /** Accent and its soft tint, for light and dark backgrounds. Light accents carry white text; dark ones dark text. */
  light: { accent: string; soft: string };
  dark: { accent: string; soft: string };
}

export const ACCENTS: Accent[] = [
  { id: "terracotta", name: "Terracotta", light: { accent: "#d9480f", soft: "#fde8dc" }, dark: { accent: "#ff8a4c", soft: "#3a2418" } },
  { id: "sage", name: "Sage", light: { accent: "#2f7a4f", soft: "#e1f0e6" }, dark: { accent: "#7cc59a", soft: "#1c3326" } },
  { id: "ocean", name: "Ocean", light: { accent: "#1c64c4", soft: "#e0ebfa" }, dark: { accent: "#6aaeff", soft: "#172a44" } },
  { id: "gold", name: "Gold", light: { accent: "#9a5b00", soft: "#f8ecd3" }, dark: { accent: "#f2b84b", soft: "#3a2c12" } },
  { id: "plum", name: "Plum", light: { accent: "#8a3aa8", soft: "#f3e6f8" }, dark: { accent: "#d29be8", soft: "#33203d" } },
  { id: "slate", name: "Slate", light: { accent: "#3f5368", soft: "#e4e9ef" }, dark: { accent: "#a9bdd2", soft: "#253039" } },
];

export const TEXT_SCALE: Record<TextSize, string> = { normal: "100%", large: "112.5%", larger: "125%" };

/** Page backgrounds, for the browser bar color. Match app/globals.css. */
const BG = { light: "#faf7f2", dark: "#12151b" };

export interface Appearance {
  theme: ThemeChoice;
  accent: string;
  text: TextSize;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: "auto", accent: "terracotta", text: "normal" };

const KEYS = { theme: "sidequest_theme", accent: "sidequest_accent", text: "sidequest_text" } as const;

/** Anything unknown falls back to the default, so a bad value can't break the app. */
export function parseAppearance(raw: { theme?: string | null; accent?: string | null; text?: string | null }): Appearance {
  const theme = raw.theme === "light" || raw.theme === "dark" || raw.theme === "auto" ? raw.theme : DEFAULT_APPEARANCE.theme;
  const accent = ACCENTS.some((a) => a.id === raw.accent) ? raw.accent! : DEFAULT_APPEARANCE.accent;
  const text = raw.text === "large" || raw.text === "larger" || raw.text === "normal" ? raw.text : DEFAULT_APPEARANCE.text;
  return { theme, accent, text };
}

export function isDark(theme: ThemeChoice, systemDark: boolean): boolean {
  return theme === "dark" || (theme === "auto" && systemDark);
}

export function getAppearance(): Appearance {
  try {
    return parseAppearance({
      theme: localStorage.getItem(KEYS.theme),
      accent: localStorage.getItem(KEYS.accent),
      text: localStorage.getItem(KEYS.text),
    });
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function systemDark(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

export function applyAppearance(a: Appearance): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = isDark(a.theme, systemDark());
  const colors = (ACCENTS.find((x) => x.id === a.accent) ?? ACCENTS[0])[dark ? "dark" : "light"];
  root.dataset.theme = dark ? "dark" : "light";
  root.style.setProperty("--accent", colors.accent);
  root.style.setProperty("--accent-soft", colors.soft);
  root.style.fontSize = TEXT_SCALE[a.text];
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? BG.dark : BG.light));
}

export function setAppearance(patch: Partial<Appearance>): Appearance {
  const next = { ...getAppearance(), ...patch };
  try {
    localStorage.setItem(KEYS.theme, next.theme);
    localStorage.setItem(KEYS.accent, next.accent);
    localStorage.setItem(KEYS.text, next.text);
  } catch {
    // storage blocked; still applies for this visit
  }
  applyAppearance(next);
  return next;
}

/** Inlined in <head>: the same as applyAppearance, before anything paints. */
export const APPEARANCE_INIT_SCRIPT = `(function(){try{
var A=${JSON.stringify(Object.fromEntries(ACCENTS.map((a) => [a.id, [a.light.accent, a.light.soft, a.dark.accent, a.dark.soft]])))};
var S=${JSON.stringify(TEXT_SCALE)};
var t=localStorage.getItem('${KEYS.theme}')||'auto',a=A[localStorage.getItem('${KEYS.accent}')]||A.terracotta,s=S[localStorage.getItem('${KEYS.text}')]||'100%';
var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var r=document.documentElement;r.setAttribute('data-theme',d?'dark':'light');
r.style.setProperty('--accent',d?a[2]:a[0]);r.style.setProperty('--accent-soft',d?a[3]:a[1]);r.style.fontSize=s;
}catch(e){}})();`;
