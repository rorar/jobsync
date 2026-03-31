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
    const result = { success: false, message: "Not authenticated" };
    const res = actionToResponse(result);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("maps 'not found' errors to 404", async () => {
    const result = { success: false, message: "Job not found" };
    const res = actionToResponse(result);
    expect(res.status).toBe(404);
  });

  it("maps validation errors to 400", async () => {
    const result = { success: false, message: "Please provide job id" };
    const res = actionToResponse(result);
    expect(res.status).toBe(400);
  });

  it("maps unknown errors to 500", async () => {
    const result = { success: false, message: "Database connection failed" };
    const res = actionToResponse(result);
    expect(res.status).toBe(500);
  });

  it("respects custom status override", async () => {
    const result = { success: true, data: { id: "1" } };
    const res = actionToResponse(result, { status: 201 });
    expect(res.status).toBe(201);
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
      error: { code: "NOT_FOUND", message: "Job not found" },
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
