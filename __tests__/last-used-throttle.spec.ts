import {
  shouldWriteLastUsedAt,
  resetLastUsedThrottle,
} from "@/lib/api/last-used-throttle";

describe("lastUsedAt throttle", () => {
  beforeEach(() => {
    resetLastUsedThrottle();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows the first write for a new key", () => {
    expect(shouldWriteLastUsedAt("key-1")).toBe(true);
  });

  it("throttles subsequent writes within the interval", () => {
    expect(shouldWriteLastUsedAt("key-1")).toBe(true);
    expect(shouldWriteLastUsedAt("key-1")).toBe(false);
    expect(shouldWriteLastUsedAt("key-1")).toBe(false);
  });

  it("allows write after 5 minutes", () => {
    expect(shouldWriteLastUsedAt("key-1")).toBe(true);
    expect(shouldWriteLastUsedAt("key-1")).toBe(false);

    // Advance 5 minutes
    jest.advanceTimersByTime(5 * 60_000);

    expect(shouldWriteLastUsedAt("key-1")).toBe(true);
  });

  it("tracks different keys independently", () => {
    expect(shouldWriteLastUsedAt("key-1")).toBe(true);
    expect(shouldWriteLastUsedAt("key-2")).toBe(true);
    expect(shouldWriteLastUsedAt("key-1")).toBe(false);
    expect(shouldWriteLastUsedAt("key-2")).toBe(false);
  });

  it("evicts oldest key when at capacity", () => {
    // Fill to MAX_TRACKED_KEYS (1000)
    for (let i = 0; i < 1000; i++) {
      shouldWriteLastUsedAt(`fill-${i}`);
    }

    // Adding a new key should succeed and evict the oldest
    expect(shouldWriteLastUsedAt("new-key")).toBe(true);

    // The oldest key (fill-0) was evicted, so it should allow a write again
    expect(shouldWriteLastUsedAt("fill-0")).toBe(true);

    // A key that wasn't evicted should still be throttled
    expect(shouldWriteLastUsedAt("fill-999")).toBe(false);
  });

  it("reset clears all state", () => {
    shouldWriteLastUsedAt("key-1");
    expect(shouldWriteLastUsedAt("key-1")).toBe(false);

    resetLastUsedThrottle();
    expect(shouldWriteLastUsedAt("key-1")).toBe(true);
  });
});
