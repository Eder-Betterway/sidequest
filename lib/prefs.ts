/**
 * Small per-phone preferences in localStorage. Nothing here matters if it's
 * lost; real data lives in Firestore.
 */

const KEYS = {
  activeTrip: "sidequest_active_trip",
  partnerEmail: "sidequest_partner_email",
  lastSeen: "sidequest_last_seen_",
} as const;

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked; fine
  }
}

export const prefs = {
  activeTrip: () => get(KEYS.activeTrip),
  setActiveTrip: (id: string | null) => set(KEYS.activeTrip, id),
  /** Remembered so the next new trip pre-fills your travel partner. */
  partnerEmail: () => get(KEYS.partnerEmail) ?? "",
  setPartnerEmail: (email: string) => set(KEYS.partnerEmail, email || null),
  /** When this phone last caught up on a trip's changes, for "since you last looked". */
  lastSeen: (tripId: string): number | null => {
    const v = Number(get(KEYS.lastSeen + tripId));
    return Number.isFinite(v) && v > 0 ? v : null;
  },
  setLastSeen: (tripId: string, at: number) => set(KEYS.lastSeen + tripId, String(at)),
};
