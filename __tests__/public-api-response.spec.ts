/**
 * Unit tests for ActionResult→HTTP Bridge (response.ts).
 *
 * NextResponse.json() depends on Response.json() which isn't fully
 * polyfilled in the test environment. We mock NextResponse to
 * capture the output and test the logic.
 */

jest.mock("next/server", () => {
  class MockNextResponse {
    status: number;
    body: unknown;
    headers: Map<string, string>;

    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map();
    }

    async json() {
      return this.body;
    }

    static json(body: unknown, init?: { status?: number }) {
      const instance = new MockNextResponse(body, init);
      return instance;
    }
  }
  return { NextResponse: MockNextResponse };
});

import {
  actionToResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
  noContentResponse,
} from "@/lib/api/response";
import type { ActionResult } from "@/models/actionResult";

// IF-5: `ActionResult.message` is now a typed i18n-key union. Several tests below
// deliberately pass arbitrary / English / legacy non-key strings to exercise
// `actionToResponse`'s runtime status inference and message sanitisation (public-API
// robustness). `anyMsg` casts past the compile-time key constraint without altering
// the runtime value being tested.
const anyMsg = (m: string) => m as NonNullable<ActionResult["message"]>;

describe("actionToResponse", () => {
  it("maps a successful ActionResult to 200 JSON", async () => {
    const result = { success: true, data: { id: "1", name: "Test" } };
    const res = actionToResponse(result);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: "1", name: "Test" });
  });

  it("includes total in response when present", async () => {
    const result = { success: true, data: [], total: 42 };
    const res = actionToResponse(result);
    const body = await res.json();
    expect(body.total).toBe(42);
  });

  it("maps 'Not authenticated' errors to 401", async () => {
    const result = { success: false, message: anyMsg("Not authenticated") };
    const res = actionToResponse(result);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("maps 'not found' errors to 404", async () => {
    const result = { success: false, message: anyMsg("Job not found") };
    const res = actionToResponse(result);
    expect(res.status).toBe(404);
  });

  it("maps validation errors to 400", async () => {
    const result = { success: false, message: anyMsg("Please provide job id") };
    const res = actionToResponse(result);
    expect(res.status).toBe(400);
  });

  it("maps unknown errors to 500", async () => {
    const result = { success: false, message: anyMsg("Database connection failed") };
    const res = actionToResponse(result);
    expect(res.status).toBe(500);
  });

  // i18n key pattern tests (S1b: inferErrorStatus must handle both English and i18n keys)
  it("maps i18n key 'api.notAuthenticated' to 401", async () => {
    const res = actionToResponse({ success: false, message: "api.notAuthenticated" });
    expect(res.status).toBe(401);
  });

  it("maps i18n key 'blacklist.entryNotFound' to 404", async () => {
    const res = actionToResponse({ success: false, message: "blacklist.entryNotFound" });
    expect(res.status).toBe(404);
  });

  it("maps i18n key 'blacklist.invalidMatchType' to 400", async () => {
    const res = actionToResponse({ success: false, message: "blacklist.invalidMatchType" });
    expect(res.status).toBe(400);
  });

  it("maps i18n key 'api.keyNameRequired' to 400", async () => {
    const res = actionToResponse({ success: false, message: "api.keyNameRequired" });
    expect(res.status).toBe(400);
  });

  it("maps i18n key 'blacklist.alreadyExists' to 409", async () => {
    const res = actionToResponse({ success: false, message: "blacklist.alreadyExists" });
    expect(res.status).toBe(409);
  });

  it("maps i18n key 'api.keyAlreadyRevoked' to 409", async () => {
    const res = actionToResponse({ success: false, message: "api.keyAlreadyRevoked" });
    expect(res.status).toBe(409);
  });

  it("maps i18n key 'api.keyMustBeRevoked' to 400", async () => {
    const res = actionToResponse({ success: false, message: "api.keyMustBeRevoked" });
    expect(res.status).toBe(400);
  });

  it("maps i18n key 'api.maxKeysReached' to 400", async () => {
    const res = actionToResponse({ success: false, message: "api.maxKeysReached" });
    expect(res.status).toBe(400);
  });

  it("respects custom status override", async () => {
    const result = { success: true, data: { id: "1" } };
    const res = actionToResponse(result, { status: 201 });
    expect(res.status).toBe(201);
  });

  // IF-5: errorCode-based status mapping takes priority over message inference
  describe("errorCode-based status mapping (IF-5)", () => {
    it("maps NOT_FOUND errorCode to 404", async () => {
      const res = actionToResponse({
        success: false,
        message: anyMsg("some.arbitrary.key"),
        errorCode: "NOT_FOUND",
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("maps UNAUTHORIZED errorCode to 401", async () => {
      const res = actionToResponse({
        success: false,
        message: anyMsg("some.arbitrary.key"),
        errorCode: "UNAUTHORIZED",
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("maps VALIDATION_ERROR errorCode to 400", async () => {
      const res = actionToResponse({
        success: false,
        message: anyMsg("some.arbitrary.key"),
        errorCode: "VALIDATION_ERROR",
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("maps DUPLICATE_ENTRY errorCode to 409", async () => {
      const res = actionToResponse({
        success: false,
        message: anyMsg("some.arbitrary.key"),
        errorCode: "DUPLICATE_ENTRY",
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("CONFLICT");
    });

    it("maps INTERNAL_ERROR errorCode to 500 and sanitizes message", async () => {
      const res = actionToResponse({
        success: false,
        message: anyMsg("Prisma query failed: connection reset"),
        errorCode: "INTERNAL_ERROR",
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toBe("An unexpected error occurred.");
    });

    it("maps STALE_STATE errorCode to 409", async () => {
      const res = actionToResponse({
        success: false,
        message: "errors.staleState",
        errorCode: "STALE_STATE",
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("CONFLICT");
    });

    it("maps INVALID_TRANSITION errorCode to 422", async () => {
      const res = actionToResponse({
        success: false,
        message: "errors.invalidTransition",
        errorCode: "INVALID_TRANSITION",
      });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_TRANSITION");
    });

    it("maps REFERENCE_ERROR errorCode to 409", async () => {
      const res = actionToResponse({
        success: false,
        message: "errors.referenceError",
        errorCode: "REFERENCE_ERROR",
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("CONFLICT");
    });

    it("errorCode takes priority over contradicting message", async () => {
      // Message says "not found" (would infer 404),
      // but errorCode says UNAUTHORIZED (should be 401)
      const res = actionToResponse({
        success: false,
        message: anyMsg("User not found"),
        errorCode: "UNAUTHORIZED",
      });
      expect(res.status).toBe(401);
    });

    it("falls back to inferErrorStatus when errorCode is absent", async () => {
      // No errorCode — must still work via message inference (backward compat)
      const res = actionToResponse({
        success: false,
        message: anyMsg("Job not found"),
      });
      expect(res.status).toBe(404);
    });
  });
});

describe("paginatedResponse", () => {
  it("returns correct pagination meta", async () => {
    const data = [{ id: "1" }, { id: "2" }];
    const res = paginatedResponse(data, 50, 2, 25);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({
      total: 50,
      page: 2,
      perPage: 25,
      totalPages: 2,
    });
  });

  it("calculates totalPages correctly for non-even divisions", async () => {
    const res = paginatedResponse([], 51, 1, 25);
    const body = await res.json();
    expect(body.meta.totalPages).toBe(3);
  });

  it("handles empty data", async () => {
    const res = paginatedResponse([], 0, 1, 25);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.meta.totalPages).toBe(0);
  });
});

describe("errorResponse", () => {
  it("returns structured error with correct status", async () => {
    const res = errorResponse("NOT_FOUND", "Job not found", 404);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: anyMsg("Job not found") },
    });
  });
});

describe("createdResponse", () => {
  it("returns 201 with data", async () => {
    const res = createdResponse({ id: "1", name: "New Job" });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: "1", name: "New Job" });
  });
});

describe("noContentResponse", () => {
  it("returns 204 with null body", () => {
    const res = noContentResponse();
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });
});
