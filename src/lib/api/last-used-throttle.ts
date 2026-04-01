/**
 * Throttle utility for lastUsedAt DB writes.
 *
 * Problem: Every API call / credential resolve writes lastUsedAt to DB.
 * At high load this becomes a bottleneck (one write per request).
 *
 * Solution: In-memory timestamp map. Only writes to DB if 5+ minutes
 * have passed since the last write for a given key ID.
 *
 * Uses globalThis to survive HMR (same pattern as RunCoordinator/EventBus).
 */

const THROTTLE_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_TRACKED_KEYS = 1000; // prevent unbounded memory growth

interface ThrottleStore {
  lastWrittenAt: Map<string, number>;
}

const g = globalThis as unknown as { __lastUsedThrottle?: ThrottleStore };
if (!g.__lastUsedThrottle) {
  g.__lastUsedThrottle = { lastWrittenAt: new Map() };
}
const store = g.__lastUsedThrottle;

/**
 * Returns true if a DB write should be performed for this key.
 * Returns false if the last write was less than THROTTLE_INTERVAL_MS ago.
 *
 * Side effect: records the current timestamp if returning true.
 */
export function shouldWriteLastUsedAt(keyId: string): boolean {
  const now = Date.now();
  const lastWritten = store.lastWrittenAt.get(keyId);

  if (lastWritten && now - lastWritten < THROTTLE_INTERVAL_MS) {
    return false; // throttled — skip this write
  }

  // Evict oldest if at capacity (LRU approximation via insertion order)
  if (store.lastWrittenAt.size >= MAX_TRACKED_KEYS && !store.lastWrittenAt.has(keyId)) {
    const firstKey = store.lastWrittenAt.keys().next().value;
    if (firstKey !== undefined) {
      store.lastWrittenAt.delete(firstKey);
    }
  }

  store.lastWrittenAt.set(keyId, now);
  return true; // proceed with DB write
}

/** For testing: reset all throttle state */
export function resetLastUsedThrottle(): void {
  store.lastWrittenAt.clear();
}
