/**
 * Integration tests for withApiAuth() — the HOF wrapper that composes the
 * entire Public API v1 security perimeter (TG-3).
 *
 * Tests the full chain: CORS → IP rate limit (120/min) → API key auth →
 * per-key rate limit (60/min) → handler execution → error sanitization.
 *
 * Strategy: mock next/server with lightweight stubs (same pattern as
 * scheduler-status-route.spec.ts), mock validateApiKey from @/lib/api/auth,
 * use REAL checkRateLimit with resetRateLimitStore() between tests.
 */

// ---------------------------------------------------------------------------
// next/server stub — must be declared before any imports
// ---------------------------------------------------------------------------

jest.mock("next/server", () => {
  class StubHeaders {
    private _map = new Map<string, string>();
    set(name: string, value: string) {
      this._map.set(name.toLowerCase(), value);
    }
    get(name: string): string | null {
      return this._map.get(name.toLowerCase()) ?? null;
    }
    has(name: string): boolean {
      return this._map.has(name.toLowerCase());
    }
    entries(): IterableIterator<[string, string]> {
      return this._map.entries();
    }
  }

  class StubNextResponse {
    status: number;
    headers: StubHeaders;
    _body: unknown;

    constructor(
      body?: unknown,
      init?: { status?: number; headers?: Record<string, string> },
    ) {
      this.status = init?.status ?? 200;
      this.headers = new StubHeaders();
      this._body = body;
      if (init?.headers) {
        for (const [k, v] of Object.entries(init.headers)) {
          this.headers.set(k, v);
        }
      }
    }

    async json(): Promise<unknown> {
      return this._body;
    }

    static json(body: unknown, init?: { status?: number }): StubNextResponse {
      const resp = new StubNextResponse(body, init);
      return resp;
    }
  }

  class StubNextRequest {
    method: string;
    headers: StubHeaders;
    url: string;

    constructor(
      url: string,
      init?: { method?: string; headers?: Record<string, string> },
    ) {
      this.url = url;
      this.method = init?.method ?? "GET";
      this.headers = new StubHeaders();
      if (init?.headers) {
        for (const [k, v] of Object.entries(init.headers)) {
          this.headers.set(k, v);
        }
      }
    }
  }

  return {
    NextRequest: StubNextRequest,
    NextResponse: StubNextResponse,
  };
});

// ---------------------------------------------------------------------------
// Mock validateApiKey — the DB-dependent auth function
// ---------------------------------------------------------------------------

const mockValidateApiKey = jest.fn();

jest.mock("@/lib/api/auth", () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
  hashApiKey: jest.requireActual("@/lib/api/auth").hashApiKey,
  generateApiKey: jest.requireActual("@/lib/api/auth").generateApiKey,
  getKeyPrefix: jest.requireActual("@/lib/api/auth").getKeyPrefix,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/api/with-api-auth";
import { resetRateLimitStore } from "@/lib/api/rate-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StubResponse {
  status: number;
  headers: {
    get(name: string): string | null;
    has(name: string): boolean;
    entries(): IterableIterator<[string, string]>;
  };
  json(): Promise<unknown>;
}

function asStub(response: unknown): StubResponse {
  return response as StubResponse;
}

function makeRequest(
  options: {
    method?: string;
    bearerToken?: string;
    xApiKey?: string;
    ip?: string;
    realIp?: string;
  } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (options.bearerToken) {
    headers["authorization"] = `Bearer ${options.bearerToken}`;
  }
  if (options.xApiKey) {
    headers["x-api-key"] = options.xApiKey;
  }
  if (options.ip) {
    headers["x-forwarded-for"] = options.ip;
  }
  if (options.realIp) {
    headers["x-real-ip"] = options.realIp;
  }

  return new NextRequest("http://localhost/api/v1/jobs", {
    method: options.method ?? "GET",
    headers,
  });
}

function makeRouteCtx(
  params?: Record<string, string>,
): { params: Promise<Record<string, string>> } {
  return {
    params: Promise.resolve(params ?? {}),
  };
}

async function parseBody(response: StubResponse): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("withApiAuth() — Public API security perimeter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimitStore();
  });

  // -----------------------------------------------------------------------
  // 1. CORS preflight
  // -----------------------------------------------------------------------

  describe("CORS preflight (OPTIONS)", () => {
    it("returns 204 with CORS headers for OPTIONS requests", async () => {
      const handler = jest.fn();
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ method: "OPTIONS" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, PATCH, DELETE, OPTIONS",
      );
      expect(res.headers.get("access-control-allow-headers")).toBe(
        "Content-Type, Authorization, X-API-Key",
      );
      expect(res.headers.get("access-control-max-age")).toBe("86400");
    });

    it("does not invoke the handler or validateApiKey for OPTIONS", async () => {
      const handler = jest.fn();
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ method: "OPTIONS" });
      await wrapped(req, makeRouteCtx());

      expect(handler).not.toHaveBeenCalled();
      expect(mockValidateApiKey).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 2. IP rate limiting (pre-auth, 120/min)
  // -----------------------------------------------------------------------

  describe("IP rate limiting (pre-auth)", () => {
    it("allows requests within the 120/min IP limit", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-1",
      });
      const handler = jest.fn().mockResolvedValue(
        (await import("next/server")).NextResponse.json({ ok: true }),
      );
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ ip: "10.0.0.1", bearerToken: "pk_live_valid" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(handler).toHaveBeenCalled();
      // Should not be 429
      expect(res.status).not.toBe(429);
    });

    it("blocks with 429 + Retry-After after 120 requests from same IP", async () => {
      // We do NOT set up auth because IP rate limit fires BEFORE auth.
      // But we need auth for the first 120 requests to pass through fully.
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-ip-test",
      });
      const handler = jest.fn().mockResolvedValue(
        (await import("next/server")).NextResponse.json({ ok: true }),
      );
      const wrapped = withApiAuth(handler);

      // Burn through 120 requests from the same IP
      for (let i = 0; i < 120; i++) {
        const req = makeRequest({ ip: "10.0.0.99", bearerToken: "pk_live_x" });
        await wrapped(req, makeRouteCtx());
      }

      // 121st request should be blocked
      const req = makeRequest({ ip: "10.0.0.99", bearerToken: "pk_live_x" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(429);
      const body = await parseBody(res);
      expect(body).toEqual({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again later.",
        },
      });
      expect(res.headers.get("retry-after")).toBeTruthy();
      // CORS headers are still present on 429
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("fires BEFORE auth — validateApiKey is not called when IP is rate-limited", async () => {
      const handler = jest.fn();
      const wrapped = withApiAuth(handler);

      // Exhaust IP limit
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-comp",
      });
      for (let i = 0; i < 120; i++) {
        const req = makeRequest({ ip: "192.168.1.1", bearerToken: "pk_live_y" });
        await wrapped(req, makeRouteCtx());
      }

      // Clear mock call count to check only the 121st request
      mockValidateApiKey.mockClear();

      const req = makeRequest({ ip: "192.168.1.1", bearerToken: "pk_live_y" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(429);
      // validateApiKey must NOT have been called for this blocked request
      expect(mockValidateApiKey).not.toHaveBeenCalled();
    });

    it("tracks different IPs independently", async () => {
      // Use unique keyHash per request to avoid per-key rate limit interference.
      // We want to test IP isolation, so each request gets a fresh key identity.
      let callCount = 0;
      mockValidateApiKey.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          userId: "user-1",
          keyHash: `hash-multi-ip-${callCount}`,
        });
      });
      const handler = jest.fn().mockResolvedValue(
        (await import("next/server")).NextResponse.json({ ok: true }),
      );
      const wrapped = withApiAuth(handler);

      // Exhaust IP limit for IP-A (120 requests, each with a unique keyHash)
      for (let i = 0; i < 120; i++) {
        const req = makeRequest({ ip: "1.1.1.1", bearerToken: "pk_live_z" });
        await wrapped(req, makeRouteCtx());
      }

      // IP-A is blocked at IP rate limit level (before auth)
      const blockedReq = makeRequest({ ip: "1.1.1.1", bearerToken: "pk_live_z" });
      const blockedRes = asStub(await wrapped(blockedReq, makeRouteCtx()));
      expect(blockedRes.status).toBe(429);

      // IP-B still works (fresh IP bucket)
      const allowedReq = makeRequest({ ip: "2.2.2.2", bearerToken: "pk_live_z" });
      const allowedRes = asStub(await wrapped(allowedReq, makeRouteCtx()));
      expect(allowedRes.status).not.toBe(429);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Auth validation
  // -----------------------------------------------------------------------

  describe("Auth validation", () => {
    it("returns 401 when no API key is provided", async () => {
      mockValidateApiKey.mockResolvedValue(null);
      const handler = jest.fn();
      const wrapped = withApiAuth(handler);

      const req = makeRequest(); // no bearer or x-api-key
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(401);
      const body = await parseBody(res);
      expect(body).toEqual({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message:
            "Invalid or missing API key. Provide a valid key via Authorization: Bearer <key> or X-API-Key header.",
        },
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it("returns 401 when the API key is invalid (not found in DB)", async () => {
      mockValidateApiKey.mockResolvedValue(null);
      const handler = jest.fn();
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ bearerToken: "pk_live_doesnotexist" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it("returns 401 when the API key is revoked", async () => {
      mockValidateApiKey.mockResolvedValue(null); // revoked keys return null
      const handler = jest.fn();
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ bearerToken: "pk_live_revokedkey" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it("passes through to handler when API key is valid", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-42",
        keyHash: "abc123hash",
      });
      const { NextResponse } = await import("next/server");
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ data: "success" }, { status: 200 }),
      );
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ bearerToken: "pk_live_validkey" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(handler).toHaveBeenCalledTimes(1);
      const body = await parseBody(res);
      expect(body).toEqual({ data: "success" });
    });

    it("includes CORS headers on 401 responses", async () => {
      mockValidateApiKey.mockResolvedValue(null);
      const handler = jest.fn();
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ bearerToken: "pk_live_bad" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(401);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  // -----------------------------------------------------------------------
  // 4. Per-key rate limiting (post-auth, 60/min)
  // -----------------------------------------------------------------------

  describe("Per-key rate limiting (post-auth)", () => {
    it("blocks with 429 + rate limit headers after 60 requests per key", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "perkey-hash-1",
      });
      const { NextResponse } = await import("next/server");
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ ok: true }),
      );
      const wrapped = withApiAuth(handler);

      // Burn through 60 requests with the same key (use different IPs to
      // avoid hitting IP rate limit)
      for (let i = 0; i < 60; i++) {
        const req = makeRequest({
          ip: `10.${Math.floor(i / 255)}.${i % 255}.1`,
          bearerToken: "pk_live_perkey",
        });
        await wrapped(req, makeRouteCtx());
      }

      // 61st request should be blocked by per-key rate limit
      const req = makeRequest({ ip: "10.99.99.1", bearerToken: "pk_live_perkey" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(429);
      const body = await parseBody(res);
      expect(body).toEqual({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded. Try again later.",
        },
      });
      expect(res.headers.get("x-ratelimit-limit")).toBeTruthy();
      expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
      expect(res.headers.get("x-ratelimit-reset")).toBeTruthy();
      expect(res.headers.get("retry-after")).toBeTruthy();
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("tracks different API keys independently", async () => {
      const { NextResponse } = await import("next/server");
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ ok: true }),
      );
      const wrapped = withApiAuth(handler);

      // Exhaust key-A
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "key-a-hash",
      });
      for (let i = 0; i < 60; i++) {
        const req = makeRequest({
          ip: `10.${Math.floor(i / 255)}.${i % 255}.2`,
          bearerToken: "pk_live_key_a",
        });
        await wrapped(req, makeRouteCtx());
      }

      // Key-A is blocked
      const blockedReq = makeRequest({ ip: "10.99.99.2", bearerToken: "pk_live_key_a" });
      const blockedRes = asStub(await wrapped(blockedReq, makeRouteCtx()));
      expect(blockedRes.status).toBe(429);

      // Key-B still works
      mockValidateApiKey.mockResolvedValue({
        userId: "user-2",
        keyHash: "key-b-hash",
      });
      const allowedReq = makeRequest({ ip: "10.99.99.3", bearerToken: "pk_live_key_b" });
      const allowedRes = asStub(await wrapped(allowedReq, makeRouteCtx()));
      expect(allowedRes.status).not.toBe(429);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Error sanitization
  // -----------------------------------------------------------------------

  describe("Error sanitization", () => {
    it("returns 500 with generic message when handler throws", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-err",
      });
      const handler = jest.fn().mockRejectedValue(
        new Error("Prisma query failed: UNIQUE constraint violation on field `email`"),
      );
      const wrapped = withApiAuth(handler);

      // Suppress expected console.error
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const req = makeRequest({ bearerToken: "pk_live_err" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(500);
      const body = await parseBody(res);
      expect(body).toEqual({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        },
      });
      // Raw error text must NOT leak
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain("Prisma");
      expect(bodyStr).not.toContain("UNIQUE constraint");
      expect(bodyStr).not.toContain("email");

      consoleSpy.mockRestore();
    });

    it("includes CORS headers on 500 error responses", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-err-cors",
      });
      const handler = jest.fn().mockRejectedValue(new Error("boom"));
      const wrapped = withApiAuth(handler);

      jest.spyOn(console, "error").mockImplementation(() => {});

      const req = makeRequest({ bearerToken: "pk_live_errcors" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(500);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");

      (console.error as jest.Mock).mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // 6. Security headers on success responses
  // -----------------------------------------------------------------------

  describe("Security and rate limit headers on success", () => {
    it("sets Cache-Control, X-Content-Type-Options, and rate limit headers", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-hdrs",
      });
      const { NextResponse } = await import("next/server");
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ data: "ok" }, { status: 200 }),
      );
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ bearerToken: "pk_live_hdrs" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      // Security headers
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");

      // Rate limit headers
      expect(res.headers.get("x-ratelimit-limit")).toBeTruthy();
      expect(res.headers.get("x-ratelimit-remaining")).toBeTruthy();
      expect(res.headers.get("x-ratelimit-reset")).toBeTruthy();

      // CORS headers
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, PATCH, DELETE, OPTIONS",
      );
    });
  });

  // -----------------------------------------------------------------------
  // 7. Handler context — userId and params
  // -----------------------------------------------------------------------

  describe("Handler context", () => {
    it("passes authenticated userId to handler", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-777",
        keyHash: "hash-ctx",
      });
      const { NextResponse } = await import("next/server");
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ ok: true }),
      );
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ bearerToken: "pk_live_ctx" });
      await wrapped(req, makeRouteCtx());

      expect(handler).toHaveBeenCalledTimes(1);
      const [, ctx] = handler.mock.calls[0];
      expect(ctx.userId).toBe("user-777");
    });

    it("resolves and passes route params to handler", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-params",
      });
      const { NextResponse } = await import("next/server");
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ ok: true }),
      );
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ bearerToken: "pk_live_params" });
      const routeCtx = makeRouteCtx({ id: "job-uuid-123" });
      await wrapped(req, routeCtx);

      const [, ctx] = handler.mock.calls[0];
      expect(ctx.params).toEqual({ id: "job-uuid-123" });
    });

    it("handles missing routeCtx params gracefully", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-noparams",
      });
      const { NextResponse } = await import("next/server");
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ ok: true }),
      );
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ bearerToken: "pk_live_noparams" });
      // Pass routeCtx with no params property
      await wrapped(req, { params: undefined as unknown as Promise<Record<string, string>> });

      const [, ctx] = handler.mock.calls[0];
      expect(ctx.params).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 8. IP resolution from headers
  // -----------------------------------------------------------------------

  describe("IP resolution", () => {
    it("uses x-forwarded-for first entry for IP identification", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-xff",
      });
      const { NextResponse } = await import("next/server");
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ ok: true }),
      );
      const wrapped = withApiAuth(handler);

      // Exhaust limit for IP from x-forwarded-for
      for (let i = 0; i < 120; i++) {
        const req = makeRequest({ ip: "203.0.113.50, 10.0.0.1", bearerToken: "pk_live_xff" });
        await wrapped(req, makeRouteCtx());
      }

      // 121st from same first-entry IP should be blocked
      const req = makeRequest({ ip: "203.0.113.50, 10.0.0.2", bearerToken: "pk_live_xff" });
      const res = asStub(await wrapped(req, makeRouteCtx()));
      expect(res.status).toBe(429);
    });

    it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-xri",
      });
      const { NextResponse } = await import("next/server");
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ ok: true }),
      );
      const wrapped = withApiAuth(handler);

      // Exhaust limit using x-real-ip
      for (let i = 0; i < 120; i++) {
        const req = makeRequest({ realIp: "198.51.100.10", bearerToken: "pk_live_xri" });
        await wrapped(req, makeRouteCtx());
      }

      // 121st from same x-real-ip should be blocked
      const req = makeRequest({ realIp: "198.51.100.10", bearerToken: "pk_live_xri" });
      const res = asStub(await wrapped(req, makeRouteCtx()));
      expect(res.status).toBe(429);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Composition order — full chain walkthrough
  // -----------------------------------------------------------------------

  describe("Composition order", () => {
    it("IP limit → auth → per-key limit → handler (full success path)", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-chain",
      });
      const { NextResponse } = await import("next/server");
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ result: "all layers passed" }, { status: 200 }),
      );
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ ip: "10.0.0.50", bearerToken: "pk_live_chain" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      // Auth was called
      expect(mockValidateApiKey).toHaveBeenCalledTimes(1);
      // Handler was called
      expect(handler).toHaveBeenCalledTimes(1);
      // Response carries the handler's body
      const body = await parseBody(res);
      expect(body).toEqual({ result: "all layers passed" });
      // Response has all required headers
      expect(res.headers.get("x-ratelimit-limit")).toBeTruthy();
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("auth failure short-circuits before handler and per-key rate limit", async () => {
      mockValidateApiKey.mockResolvedValue(null);
      const handler = jest.fn();
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ ip: "10.0.0.51", bearerToken: "pk_live_bad" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 10. Edge cases
  // -----------------------------------------------------------------------

  describe("Edge cases", () => {
    it("handles handler returning non-JSON response gracefully", async () => {
      mockValidateApiKey.mockResolvedValue({
        userId: "user-1",
        keyHash: "hash-nonjson",
      });
      const { NextResponse } = await import("next/server");
      // Handler returns a plain text response (NextResponse with headers stub)
      const plainResp = new NextResponse(null, { status: 204 });
      const handler = jest.fn().mockResolvedValue(plainResp);
      const wrapped = withApiAuth(handler);

      const req = makeRequest({ bearerToken: "pk_live_nonjson" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(204);
      // Rate limit and CORS headers still attached
      expect(res.headers.get("x-ratelimit-limit")).toBeTruthy();
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("handles validateApiKey throwing an error (treated as 500)", async () => {
      mockValidateApiKey.mockRejectedValue(new Error("DB connection lost"));
      const handler = jest.fn();
      const wrapped = withApiAuth(handler);

      jest.spyOn(console, "error").mockImplementation(() => {});

      const req = makeRequest({ bearerToken: "pk_live_dberr" });
      const res = asStub(await wrapped(req, makeRouteCtx()));

      expect(res.status).toBe(500);
      const body = await parseBody(res);
      expect(body).toEqual({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        },
      });
      // DB error details must not leak
      expect(JSON.stringify(body)).not.toContain("DB connection");
      expect(handler).not.toHaveBeenCalled();

      (console.error as jest.Mock).mockRestore();
    });
  });
});
