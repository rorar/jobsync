import { ConnectorCache, type CachePolicy } from "@/lib/connector/cache";

describe("ConnectorCache", () => {
  let cache: ConnectorCache;

  beforeEach(() => {
    cache = new ConnectorCache(10);
  });

  // ---------------------------------------------------------------------------
  // buildKey
  // ---------------------------------------------------------------------------

  describe("buildKey", () => {
    it("builds basic key from module:operation:params", () => {
      const key = ConnectorCache.buildKey({
        module: "eures",
        operation: "search",
        params: "keywords=dev",
      });
      expect(key).toBe("eures:search:keywords=dev");
    });

    it("includes locale when policy is localeSensitive", () => {
      const policy: CachePolicy = { ttl: 300, scope: "shared", localeSensitive: true };
      const key = ConnectorCache.buildKey({
        module: "eures",
        operation: "search",
        params: "keywords=dev",
        locale: "de",
        policy,
      });
      expect(key).toBe("eures:search:keywords=dev:de");
    });

    it("excludes locale when policy is not localeSensitive", () => {
      const policy: CachePolicy = { ttl: 300, scope: "shared", localeSensitive: false };
      const key = ConnectorCache.buildKey({
        module: "jsearch",
        operation: "search",
        params: "q=dev",
        locale: "de",
        policy,
      });
      expect(key).toBe("jsearch:search:q=dev");
    });

    it("includes userId when scope is per-user", () => {
      const policy: CachePolicy = { ttl: 300, scope: "per-user", localeSensitive: false };
      const key = ConnectorCache.buildKey({
        module: "ai",
        operation: "match",
        params: "job123",
        userId: "user-1",
        policy,
      });
      expect(key).toBe("ai:match:job123:user-1");
    });

    it("excludes userId when scope is shared", () => {
      const policy: CachePolicy = { ttl: 300, scope: "shared", localeSensitive: false };
      const key = ConnectorCache.buildKey({
        module: "eures",
        operation: "search",
        params: "q=dev",
        userId: "user-1",
        policy,
      });
      expect(key).toBe("eures:search:q=dev");
    });
  });

  // ---------------------------------------------------------------------------
  // get / set
  // ---------------------------------------------------------------------------

  describe("get / set", () => {
    it("returns undefined for missing key", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("stores and retrieves a value", () => {
      cache.set("key1", { data: "hello" }, 60);
      expect(cache.get("key1")).toEqual({ data: "hello" });
    });

    it("returns undefined for expired entry", () => {
      const now = Date.now();
      jest.spyOn(Date, "now")
        .mockReturnValueOnce(now)      // set: expiresAt
        .mockReturnValueOnce(now)      // set: createdAt
        .mockReturnValueOnce(now + 61000); // get: expired

      cache.set("key1", "value", 60);
      expect(cache.get("key1")).toBeUndefined();

      jest.restoreAllMocks();
    });
  });

  // ---------------------------------------------------------------------------
  // getOrFetch
  // ---------------------------------------------------------------------------

  describe("getOrFetch", () => {
    it("fetches and caches on first call", async () => {
      const fetcher = jest.fn().mockResolvedValue("result");

      const value = await cache.getOrFetch("key1", fetcher, 60);

      expect(value).toBe("result");
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Second call should hit cache
      const value2 = await cache.getOrFetch("key1", fetcher, 60);
      expect(value2).toBe("result");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("bypasses cache when bypass option is true", async () => {
      cache.set("key1", "cached", 60);
      const fetcher = jest.fn().mockResolvedValue("fresh");

      const value = await cache.getOrFetch("key1", fetcher, 60, { bypass: true });

      expect(value).toBe("fresh");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("coalesces concurrent requests for the same key", async () => {
      let resolvePromise: (value: string) => void;
      const slowFetcher = jest.fn().mockReturnValue(
        new Promise<string>((resolve) => { resolvePromise = resolve; }),
      );

      const p1 = cache.getOrFetch("key1", slowFetcher, 60);
      const p2 = cache.getOrFetch("key1", slowFetcher, 60);

      // Fetcher should only be called once (coalesced)
      expect(slowFetcher).toHaveBeenCalledTimes(1);

      resolvePromise!("coalesced");

      const [v1, v2] = await Promise.all([p1, p2]);
      expect(v1).toBe("coalesced");
      expect(v2).toBe("coalesced");
    });

    it("returns stale value on fetch error (stale-if-error)", async () => {
      // Populate cache, then expire it
      const now = Date.now();
      jest.spyOn(Date, "now")
        .mockReturnValueOnce(now)           // set: expiresAt
        .mockReturnValueOnce(now)           // set: createdAt
        .mockReturnValueOnce(now + 61000)   // get: expired (miss)
        .mockReturnValueOnce(now + 61000);  // getStale: returns stale

      cache.set("key1", "stale-value", 60);

      const failingFetcher = jest.fn().mockRejectedValue(new Error("network error"));
      const value = await cache.getOrFetch("key1", failingFetcher, 60);

      expect(value).toBe("stale-value");
      jest.restoreAllMocks();
    });

    it("throws when fetch fails and no stale entry exists", async () => {
      const failingFetcher = jest.fn().mockRejectedValue(new Error("network error"));

      await expect(cache.getOrFetch("key1", failingFetcher, 60)).rejects.toThrow("network error");
    });
  });

  // ---------------------------------------------------------------------------
  // invalidateModule
  // ---------------------------------------------------------------------------

  describe("invalidateModule", () => {
    it("removes all entries for a specific module", () => {
      cache.set("eures:search:q=dev", "a", 60);
      cache.set("eures:details:id=1", "b", 60);
      cache.set("jsearch:search:q=dev", "c", 60);

      const count = cache.invalidateModule("eures");

      expect(count).toBe(2);
      expect(cache.get("eures:search:q=dev")).toBeUndefined();
      expect(cache.get("jsearch:search:q=dev")).toBe("c");
    });
  });

  // ---------------------------------------------------------------------------
  // eviction / prune
  // ---------------------------------------------------------------------------

  describe("eviction", () => {
    it("evicts oldest entry when at capacity", () => {
      const smallCache = new ConnectorCache(3);
      smallCache.set("a", 1, 60);
      smallCache.set("b", 2, 60);
      smallCache.set("c", 3, 60);

      // Adding a 4th should evict "a" (oldest)
      smallCache.set("d", 4, 60);
      expect(smallCache.get("a")).toBeUndefined();
      expect(smallCache.get("d")).toBe(4);
    });
  });

  describe("prune", () => {
    it("removes expired entries", () => {
      const now = Date.now();
      jest.spyOn(Date, "now")
        .mockReturnValueOnce(now)         // set key1: expiresAt
        .mockReturnValueOnce(now)         // set key1: createdAt
        .mockReturnValueOnce(now)         // set key2: expiresAt
        .mockReturnValueOnce(now)         // set key2: createdAt
        .mockReturnValueOnce(now + 31000) // prune: now (key1 expired at +30s, key2 alive at +60s)
        .mockReturnValueOnce(now + 31000); // get key2: check expiry

      cache.set("key1", "short", 30);
      cache.set("key2", "long", 60);

      const pruned = cache.prune();
      expect(pruned).toBe(1);
      expect(cache.get("key2")).toBe("long");

      jest.restoreAllMocks();
    });
  });

  // ---------------------------------------------------------------------------
  // stats
  // ---------------------------------------------------------------------------

  describe("getStats", () => {
    it("tracks hits and misses", () => {
      cache.set("key1", "value", 60);
      cache.get("key1");        // hit
      cache.get("key1");        // hit
      cache.get("nonexistent"); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // clear
  // ---------------------------------------------------------------------------

  describe("clear", () => {
    it("resets all state", () => {
      cache.set("key1", "value", 60);
      cache.get("key1");

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });
  });
});
