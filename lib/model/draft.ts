/**
 * Draft changes: requests you jot down for a day (or the whole trip) without
 * asking Claude yet. Saved with the trip (`trips/{id}/drafts`), work offline,
 * and go to Claude together so the re-plan sees all of them at once.
 */

export const MAX_DRAFT_TEXT = 600;

export interface ChangeDraftDoc {
  text: string;
  /** The day it's about, or null for the whole trip. */
  dayDate: string | null;
  /** Also keep it as a trip rule once it's sent. */
  rule: boolean;
  createdBy: string;
  createdAt: number;
  /** Set when someone edits it. */
  updatedBy?: string;
  updatedAt?: number;
}

export interface ChangeDraft extends ChangeDraftDoc {
  id: string;
  pending: boolean;
}

/** Validate a draft; the data layer stamps when it was made. */
export function buildDraft(
  input: { text: string; dayDate: string | null; rule: boolean },
  me: string
): { ok: true; draft: Omit<ChangeDraftDoc, "createdAt"> } | { ok: false; error: string } {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "Write what should change first." };
  if (text.length > MAX_DRAFT_TEXT) return { ok: false, error: `Keep each change under ${MAX_DRAFT_TEXT} characters.` };
  return { ok: true, draft: { text, dayDate: input.dayDate, rule: input.rule, createdBy: me.trim().toLowerCase() } };
}

/** Drafts that belong to a scope: one day, or (null) every draft on the trip. */
export function draftsFor<T extends Pick<ChangeDraftDoc, "dayDate">>(drafts: T[], scope: string | null): T[] {
  return scope === null ? drafts : drafts.filter((d) => d.dayDate === scope);
}

export interface Request {
  text: string;
  dayDate: string | null;
}

/**
 * Several requests as one instruction for the planner. A single request about
 * the day you're on stays as you wrote it; otherwise each line says its day.
 */
export function combineRequests(requests: Request[], focusDate: string | null): { instruction: string; focusDate: string | null } {
  const list = requests.filter((r) => r.text.trim());
  if (list.length === 1 && list[0].dayDate === focusDate) return { instruction: list[0].text.trim(), focusDate };
  const sorted = [...list].sort((a, b) => (a.dayDate ?? "").localeCompare(b.dayDate ?? ""));
  return {
    instruction: `Make all of these changes together:\n${sorted.map((r) => `- ${r.dayDate ? `On ${r.dayDate}` : "Whole trip"}: ${r.text.trim()}`).join("\n")}`,
    focusDate: list.every((r) => r.dayDate === focusDate) ? focusDate : null,
  };
}

/** How a request reads as a trip rule. */
export function ruleText(r: Request): string {
  return r.dayDate ? `On ${r.dayDate}: ${r.text.trim()}` : r.text.trim();
}
