import { describe, expect, it } from "vitest";
import { ago, connectionLabel } from "@/lib/connection";

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const min = 60_000;

describe("ago", () => {
  it("rounds to friendly units", () => {
    expect(ago(NOW - 10_000, NOW)).toBe("just now");
    expect(ago(NOW - 4 * min, NOW)).toBe("4 min ago");
    expect(ago(NOW - 2 * 60 * min, NOW)).toBe("2 h ago");
    expect(ago(NOW - 24 * 60 * min, NOW)).toBe("24 h ago");
    expect(ago(NOW - 3 * 24 * 60 * min, NOW)).toBe("3 days ago");
  });

  it("never goes negative when clocks disagree", () => {
    expect(ago(NOW + 5 * min, NOW)).toBe("just now");
  });
});

describe("connectionLabel", () => {
  it("shows offline with the last sync time", () => {
    expect(connectionLabel({ online: false, lastSyncedAt: NOW - 4 * min, pendingWrites: 0 }, NOW)).toEqual({
      text: "Offline · synced 4 min ago",
      tone: "warn",
    });
  });

  it("puts unsynced changes ahead of the sync time when offline", () => {
    expect(connectionLabel({ online: false, lastSyncedAt: NOW - 4 * min, pendingWrites: 2 }, NOW).text).toBe(
      "Offline · 2 waiting to sync"
    );
  });

  it("handles a phone that never synced", () => {
    expect(connectionLabel({ online: false, lastSyncedAt: null, pendingWrites: 0 }, NOW).text).toBe(
      "Offline · not synced yet"
    );
    expect(connectionLabel({ online: true, lastSyncedAt: null, pendingWrites: 0 }, NOW).text).toBe("Online");
  });

  it("shows syncing while writes are in flight online", () => {
    expect(connectionLabel({ online: true, lastSyncedAt: NOW, pendingWrites: 1 }, NOW)).toEqual({
      text: "Syncing · 1 waiting to sync",
      tone: "muted",
    });
  });
});
