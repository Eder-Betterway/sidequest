import type { Trip } from "@/lib/model/trip";

/**
 * A plain JSON copy of everything this phone can see, for peace of mind
 * (the same idea as Playa's backup panel). Grows as trips get days and notes.
 */
export function buildExport(trips: Trip[], exportedBy: string, now: number) {
  return {
    app: "sidequest",
    version: 1,
    exportedAt: new Date(now).toISOString(),
    exportedBy,
    trips: trips.map((t) => {
      const trip: Partial<Trip> = { ...t };
      delete trip.pending;
      return trip;
    }),
  };
}

export function exportFileName(now: number): string {
  return `sidequest-backup-${new Date(now).toISOString().slice(0, 10)}.json`;
}
