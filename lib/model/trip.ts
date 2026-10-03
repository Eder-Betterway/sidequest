/**
 * The trip record as stored in Firestore (`trips/{id}`), plus the pure helpers
 * that build and check one. More fields (inputs, vehicle, vibe) arrive with the
 * trip wizard.
 */

export interface TripDoc {
  title: string;
  /** ISO dates (YYYY-MM-DD). Optional while a trip is still a loose idea. */
  startDate: string | null;
  endDate: string | null;
  /** Lowercased. Membership is by email so a partner can be added before they ever sign in. */
  memberEmails: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface Trip extends TripDoc {
  id: string;
  /** True while this phone has changes the server hasn't confirmed yet. */
  pending: boolean;
}

export interface NewTripInput {
  title: string;
  startDate?: string;
  endDate?: string;
  /** Who you're traveling with. Optional: solo trips are fine. */
  partnerEmail?: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BuildResult = { ok: true; trip: TripDoc } | { ok: false; error: string };

/** Validate the "new trip" form and shape it into a record. */
export function buildNewTrip(input: NewTripInput, me: string, now: number): BuildResult {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the trip a name." };
  if (title.length > 120) return { ok: false, error: "That name is a bit long. Keep it under 120 characters." };

  const startDate = input.startDate?.trim() || null;
  const endDate = input.endDate?.trim() || null;
  for (const d of [startDate, endDate]) {
    if (d !== null && !ISO_DATE.test(d)) return { ok: false, error: "Dates need to look like 2026-10-14." };
  }
  if (startDate && endDate && endDate < startDate) {
    return { ok: false, error: "The end date is before the start date." };
  }

  const self = normalizeEmail(me);
  const members = [self];
  const partner = input.partnerEmail ? normalizeEmail(input.partnerEmail) : "";
  if (partner) {
    if (!EMAIL.test(partner)) return { ok: false, error: "That travel partner email doesn't look right." };
    if (partner !== self) members.push(partner);
  }

  return {
    ok: true,
    trip: { title, startDate, endDate, memberEmails: members, createdBy: self, createdAt: now, updatedAt: now },
  };
}

/** "Oct 14 to 28, 2026", "Oct 30 to Nov 4, 2026", "From Oct 14, 2026", or "Dates open". */
export function formatTripDates(start: string | null, end: string | null): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  if (start && end) {
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    const sameMonth = sameYear && start.slice(5, 7) === end.slice(5, 7);
    const endText = sameMonth ? `${Number(end.slice(8, 10))}, ${end.slice(0, 4)}` : fmt(end, true);
    return `${fmt(start, !sameYear)} to ${endText}`;
  }
  if (start) return `From ${fmt(start, true)}`;
  if (end) return `Until ${fmt(end, true)}`;
  return "Dates open";
}

/** Upcoming and current trips first (soonest start), then undated, then past trips (most recent first). */
export function sortTrips<T extends Pick<TripDoc, "startDate" | "endDate" | "createdAt">>(trips: T[], today: string): T[] {
  const rank = (t: T) => {
    if (!t.startDate && !t.endDate) return 1;
    const last = t.endDate ?? t.startDate!;
    return last < today ? 2 : 0;
  };
  return [...trips].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return (a.startDate ?? a.endDate!).localeCompare(b.startDate ?? b.endDate!);
    if (ra === 2) return (b.endDate ?? b.startDate!).localeCompare(a.endDate ?? a.startDate!);
    return b.createdAt - a.createdAt;
  });
}
