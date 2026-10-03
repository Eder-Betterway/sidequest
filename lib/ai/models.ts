/**
 * Every Claude model ID used by the app lives here, so swapping one is a
 * one-line change. Pick by job, not by route.
 */
export const MODELS = {
  /** Juggling many hard constraints at once: the 3 trip options, whole-trip re-plans. */
  planner: "claude-opus-5-5",
  /** Most day-to-day work: expanding days, re-planning a day, deep-dives, Q&A. */
  everyday: "claude-sonnet-5-5",
  /** Small, fast jobs: reading a flyer photo, turning research into JSON. */
  quick: "claude-haiku-4-5-20251001",
} as const;

export type ModelRole = keyof typeof MODELS;
