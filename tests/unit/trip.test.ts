import { describe, expect, it } from "vitest";
import { buildNewTrip, formatTripDates, sortTrips } from "@/lib/model/trip";

const NOW = 1_790_000_000_000;

describe("buildNewTrip", () => {
  it("builds a trip with both travelers as members", () => {
    const r = buildNewTrip(
      { title: "  Desert loop ", startDate: "2026-10-14", endDate: "2026-10-28", partnerEmail: " Partner@Example.com " },
      "Me@Example.com",
      NOW
    );
    expect(r).toEqual({
      ok: true,
      trip: {
        title: "Desert loop",
        startDate: "2026-10-14",
        endDate: "2026-10-28",
        memberEmails: ["me@example.com", "partner@example.com"],
        createdBy: "me@example.com",
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
  });

  it("allows loose trips with no dates and no partner", () => {
    const r = buildNewTrip({ title: "Someday: Patagonia" }, "me@example.com", NOW);
    expect(r.ok && r.trip).toMatchObject({ startDate: null, endDate: null, memberEmails: ["me@example.com"] });
  });

  it("doesn't add yourself twice", () => {
    const r = buildNewTrip({ title: "Solo", partnerEmail: "ME@example.com" }, "me@example.com", NOW);
    expect(r.ok && r.trip.memberEmails).toEqual(["me@example.com"]);
  });

  it("rejects bad input with a friendly message", () => {
    expect(buildNewTrip({ title: "  " }, "me@example.com", NOW)).toEqual({ ok: false, error: "Give the trip a name." });
    expect(buildNewTrip({ title: "x", startDate: "10/14/2026" }, "me@example.com", NOW).ok).toBe(false);
    expect(buildNewTrip({ title: "x", startDate: "2026-10-14", endDate: "2026-10-01" }, "me@example.com", NOW)).toEqual({
      ok: false,
      error: "The end date is before the start date.",
    });
    expect(buildNewTrip({ title: "x", partnerEmail: "not an email" }, "me@example.com", NOW).ok).toBe(false);
  });
});

describe("formatTripDates", () => {
  it("reads naturally", () => {
    expect(formatTripDates("2026-10-14", "2026-10-28")).toBe("Oct 14 to 28, 2026");
    expect(formatTripDates("2026-10-30", "2026-11-04")).toBe("Oct 30 to Nov 4, 2026");
    expect(formatTripDates("2026-12-28", "2027-01-03")).toBe("Dec 28, 2026 to Jan 3, 2027");
    expect(formatTripDates("2026-10-14", null)).toBe("From Oct 14, 2026");
    expect(formatTripDates(null, null)).toBe("Dates open");
  });
});

describe("sortTrips", () => {
  it("puts current and upcoming first, then undated, then past", () => {
    const t = (id: string, startDate: string | null, endDate: string | null, createdAt = 0) => ({
      id,
      startDate,
      endDate,
      createdAt,
    });
    const sorted = sortTrips(
      [
        t("past-old", "2025-01-01", "2025-01-10"),
        t("undated", null, null),
        t("later", "2026-12-01", "2026-12-10"),
        t("now", "2026-09-28", "2026-10-20"),
        t("past-recent", "2026-08-01", "2026-08-20"),
      ],
      "2026-10-03"
    );
    expect(sorted.map((x) => x.id)).toEqual(["now", "later", "undated", "past-recent", "past-old"]);
  });
});

describe("buildExport", () => {
  it("drops phone-only fields and stamps the export", async () => {
    const { buildExport, exportFileName } = await import("@/lib/data/export");
    const trip = {
      id: "t1",
      title: "Desert loop",
      startDate: null,
      endDate: null,
      memberEmails: ["me@example.com"],
      createdBy: "me@example.com",
      createdAt: 1,
      updatedAt: 1,
      pending: true,
    };
    const out = buildExport([trip], "me@example.com", Date.UTC(2026, 9, 3));
    expect(out.trips[0]).not.toHaveProperty("pending");
    expect(out.trips[0]).toMatchObject({ id: "t1", title: "Desert loop" });
    expect(out.exportedAt).toBe("2026-10-03T00:00:00.000Z");
    expect(exportFileName(Date.UTC(2026, 9, 3))).toBe("sidequest-backup-2026-10-03.json");
  });
});
