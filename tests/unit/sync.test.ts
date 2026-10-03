import { describe, expect, it } from "vitest";
import { createSyncStore } from "@/lib/data/sync";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe("sync store", () => {
  it("adds up pending writes across listeners", () => {
    const s = createSyncStore();
    s.report("a", { pendingWrites: 2, fromServer: false }, 1);
    s.report("b", { pendingWrites: 1, fromServer: false }, 2);
    expect(s.get().pendingWrites).toBe(3);
    s.forget("a");
    expect(s.get().pendingWrites).toBe(1);
  });

  it("only marks synced when the server confirmed everything", () => {
    const storage = memoryStorage();
    const s = createSyncStore(storage);
    s.report("a", { pendingWrites: 1, fromServer: true }, 100);
    expect(s.get().lastSyncedAt).toBeNull();
    s.report("a", { pendingWrites: 0, fromServer: false }, 200);
    expect(s.get().lastSyncedAt).toBeNull();
    s.report("a", { pendingWrites: 0, fromServer: true }, 300);
    expect(s.get().lastSyncedAt).toBe(300);
    expect(storage.data.sidequest_last_synced_at).toBe("300");
  });

  it("remembers the last sync across app restarts", () => {
    const s = createSyncStore(memoryStorage({ sidequest_last_synced_at: "1234" }));
    expect(s.get().lastSyncedAt).toBe(1234);
  });

  it("notifies subscribers only on real changes", () => {
    const s = createSyncStore();
    let calls = 0;
    s.subscribe(() => calls++);
    s.report("a", { pendingWrites: 0, fromServer: false }, 1);
    expect(calls).toBe(0);
    s.report("a", { pendingWrites: 1, fromServer: false }, 2);
    expect(calls).toBe(1);
  });
});
