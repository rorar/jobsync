/**
 * Response Caching — Stufe 1 (ROADMAP 0.9)
 *
 * In-memory LRU cache with TTL for Connector responses.
 * Zero external dependencies. Strategy Pattern allows future swap
 * to SQLite (Stufe 2) or Redis (Stufe 3).
 *
 * Key invariants (from ROADMAP):
 * - Locale-aware keys: {module}:{operation}:{params}:{locale}
 * - Automation bypass: scheduler runs set bypassCache=true
 * - Negative caching: 404 cached briefly, 5xx never cached
 * - Request coalescing: prevents thundering herd on expired entries
 * - Shared scope for public data, per-user for AI responses
 */

// =============================================================================
// Types
// =============================================================================

export type CacheScope = "shared" | "per-user";

export interface CachePolicy {
  /** Default TTL in seconds */
  ttl: number;
  /** Whether responses are user-specific (AI) or public (job search) */
  scope: CacheScope;
  /** Whether the module returns locale-dependent responses */
  localeSensitive: boolean;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
}

// =============================================================================
// ConnectorCache
// =============================================================================

export class ConnectorCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();
  private hits = 0;
  private misses = 0;
  private readonly maxSize: number;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  /**
   * Build a cache key from structured parts.
   * Includes locale and userId when the cache policy requires it.
   */
  static buildKey(parts: {
    module: string;
    operation: string;
    params: string;
    locale?: string;
    userId?: string;
    policy?: CachePolicy;
  }): string {
    const segments = [parts.module, parts.operation, parts.params];

    if (parts.policy?.localeSensitive && parts.locale) {
      segments.push(parts.locale);
    }

    if (parts.policy?.scope === "per-user" && parts.userId) {
      segments.push(parts.userId);
    }

    return segments.join(":");
  }

  /**
   * Get a cached value, or fetch and cache it.
   * Implements request coalescing: concurrent calls for the same key
   * share a single in-flight request (prevents thundering herd).
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number,
    options?: { bypass?: boolean },
  ): Promise<T> {
    // Bypass: skip cache entirely (used by scheduler runs)
    if (options?.bypass) {
      return fetcher();
    }

    // Check cache
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Request coalescing: if already fetching this key, wait for it
    const inflight = this.inflight.get(key);
    if (inflight) {
      return inflight as Promise<T>;
    }

    // Fetch and cache
    const promise = fetcher()
      .then((value) => {
        this.set(key, value, ttlSeconds);
        this.inflight.delete(key);
        return value;
      })
      .catch((error) => {
        this.inflight.delete(key);
        // Try stale-if-error: return expired entry if available
        const stale = this.getStale<T>(key);
        if (stale !== undefined) {
          return stale;
        }
        throw error;
      });

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Get a cached value if it exists and hasn't expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      // Expired — don't delete yet (stale-if-error might need it)
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.value as T;
  }

  /**
   * Get a stale (expired) cached value for stale-if-error fallback.
   */
  private getStale<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    return entry.value as T;
  }

  /**
   * Set a cached value with TTL.
   */
  set<T>(key: string, value: T, ttlSeconds: number): void {
    // Evict oldest if at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictOldest();
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      createdAt: Date.now(),
    });
  }

  /**
   * Remove a specific key.
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Remove all entries for a specific module.
   */
  invalidateModule(moduleId: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(`${moduleId}:`)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics for observability.
   */
  getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Remove expired entries (housekeeping).
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Evict the oldest entry (simple LRU approximation via insertion order).
   * Map preserves insertion order, so the first key is the oldest.
   */
  private evictOldest(): void {
    const firstKey = this.store.keys().next().value;
    if (firstKey !== undefined) {
      this.store.delete(firstKey);
    }
  }
}

// =============================================================================
// Singleton (survives HMR via globalThis)
// =============================================================================

const GLOBAL_KEY = "__jobsync_connector_cache__";

declare const globalThis: {
  [GLOBAL_KEY]?: ConnectorCache;
} & typeof global;

export const connectorCache: ConnectorCache =
  globalThis[GLOBAL_KEY] ?? new ConnectorCache();

if (process.env.NODE_ENV !== "production") {
  globalThis[GLOBAL_KEY] = connectorCache;
}

// =============================================================================
// Default Cache Policies (per ROADMAP 0.9)
// =============================================================================

/** ESCO/Eurostat reference data — changes rarely */
export const CACHE_POLICY_REFERENCE: CachePolicy = {
  ttl: 86400, // 24 hours
  scope: "shared",
  localeSensitive: true,
};

/** Job search results — moderate freshness needed */
export const CACHE_POLICY_SEARCH: CachePolicy = {
  ttl: 900, // 15 minutes
  scope: "shared",
  localeSensitive: false,
};

/** Health checks — short TTL */
export const CACHE_POLICY_HEALTH: CachePolicy = {
  ttl: 300, // 5 minutes
  scope: "shared",
  localeSensitive: false,
};

/** 404 / not-found — brief negative cache */
export const CACHE_POLICY_NOT_FOUND: CachePolicy = {
  ttl: 300, // 5 minutes
  scope: "shared",
  localeSensitive: false,
};
