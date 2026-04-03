/**
 * Unit tests for POST /api/v1/jobs/:id/status — CRM State Machine via Public API.
 *
 * S3-D1 fix: Status changes must go through the state machine, not via PATCH.
 * Tests: valid transition, invalid transition, missing statusId, stale state
 * (expectedFromStatusId mismatch), job not found, invalid UUID.
 *
 * Strategy: mock withApiAuth to bypass auth/rate-limit, mock @/lib/db (prisma)
 * to verify query shapes and ownership filters. NextResponse is stubbed with
 * a lightweight class following the pattern from api-v1-jobs.spec.ts.
 */

// ---------------------------------------------------------------------------
// next/server stub
// ---------------------------------------------------------------------------

jest.mock("next/server", () => {
  class StubHeaders {
    private _map = new Map<string, string>();
    set(name: string, value: string) { this._map.set(name.toLowerCase(), value); }
    get(name: string): string | null { return this._map.get(name.toLowerCase()) ?? null; }
    has(name: string): boolean { return this._map.has(name.toLowerCase()); }
    forEach(cb: (value: string, key: string) => void) { this._map.forEach(cb); }
  }

  class StubNextResponse {
    status: number;
    headers: StubHeaders;
    _body: unknown;

    constructor(body?: unknown, init?: { status?: number }) {
      this._body = body;
      this.status = init?.status ?? 200;
      this.headers = new StubHeaders();
    }

    async json() {
      return this._body;
    }

    get body() {
      return this._body;
    }

    static json(body: unknown, init?: { status?: number }) {
      return new StubNextResponse(body, init);
    }
  }

  return { NextResponse: StubNextResponse, NextRequest: class {} };
});

// ---------------------------------------------------------------------------
// withApiAuth mock — bypass auth, inject userId directly
// ---------------------------------------------------------------------------

jest.mock("@/lib/api/with-api-auth", () => ({
  withApiAuth: (handler: Function) => async (req: any, routeCtx: any) => {
    const params = routeCtx?.params ? await routeCtx.params : undefined;
    return handler(req, {
      userId: "test-user-id",
      keyHash: "test-hash",
      params,
    });
  },
}));

// ---------------------------------------------------------------------------
// prisma mock
// ---------------------------------------------------------------------------

const mockTransaction = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    job: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    jobStatus: {
      findFirst: jest.fn(),
    },
    jobStatusHistory: {
      create: jest.fn(),
    },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import db from "@/lib/db";

import {
  POST as changeStatus,
} from "@/app/api/v1/jobs/[id]/status/route";

// Typed reference to the mocked prisma client
const mockPrisma = db as unknown as {
  job: { findFirst: jest.Mock; update: jest.Mock };
  jobStatus: { findFirst: jest.Mock };
  jobStatusHistory: { create: jest.Mock };
  $transaction: jest.Mock;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const STATUS_BOOKMARKED_ID = "11111111-1111-4111-a111-111111111111";
const STATUS_APPLIED_ID = "22222222-2222-4222-a222-222222222222";
const STATUS_OFFER_ID = "33333333-3333-4333-a333-333333333333";

function mockRequest(
  url: string,
  options?: { method?: string; body?: unknown },
) {
  return {
    url,
    method: options?.method ?? "POST",
    json: options?.body
      ? jest.fn().mockResolvedValue(options.body)
      : jest.fn().mockRejectedValue(new Error("no body")),
    headers: { get: () => null },
  } as any;
}

function routeCtx(id?: string) {
  return { params: Promise.resolve(id ? { id } : {}) } as any;
}

type StubResponse = {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<any>;
  body: unknown;
};

function asRes(r: unknown): StubResponse {
  return r as StubResponse;
}

function makeJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    createdAt: new Date("2026-01-15"),
    jobType: "Full-time",
    jobUrl: null,
    description: "",
    salaryRange: null,
    dueDate: null,
    appliedDate: null,
    applied: false,
    matchScore: null,
    JobTitle: { id: "jt-1", label: "Engineer", value: "engineer" },
    Company: { id: "co-1", label: "Acme", value: "acme" },
    Status: { id: STATUS_APPLIED_ID, label: "Applied", value: "applied" },
    Location: null,
    JobSource: null,
    tags: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// =========================================================================
// POST /api/v1/jobs/:id/status — Change job status
// =========================================================================

describe("POST /api/v1/jobs/:id/status", () => {
  it("changes status via valid transition and returns 200 (happy path: bookmarked -> applied)", async () => {
    // Current job is "bookmarked"
    mockPrisma.job.findFirst.mockResolvedValue({
      id: VALID_UUID,
      statusId: STATUS_BOOKMARKED_ID,
      appliedDate: null,
      Status: { value: "bookmarked" },
    });
    // Target status is "applied"
    mockPrisma.jobStatus.findFirst.mockResolvedValue({
      id: STATUS_APPLIED_ID,
      value: "applied",
    });

    const updatedJob = makeJobRow({ Status: { id: STATUS_APPLIED_ID, label: "Applied", value: "applied" } });
    // Mock $transaction to execute the callback and return the result
    mockTransaction.mockImplementation(async (fn: Function) => {
      const txPrisma = {
        job: { update: jest.fn().mockResolvedValue(updatedJob) },
        jobStatusHistory: { create: jest.fn().mockResolvedValue({ id: "hist-1" }) },
      };
      return fn(txPrisma);
    });

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      { body: { statusId: STATUS_APPLIED_ID } },
    );
    const res = asRes(await changeStatus(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.Status.value).toBe("applied");
  });

  it("creates a history entry with note in the transaction", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({
      id: VALID_UUID,
      statusId: STATUS_BOOKMARKED_ID,
      appliedDate: null,
      Status: { value: "bookmarked" },
    });
    mockPrisma.jobStatus.findFirst.mockResolvedValue({
      id: STATUS_APPLIED_ID,
      value: "applied",
    });

    const mockHistoryCreate = jest.fn().mockResolvedValue({ id: "hist-1" });
    mockTransaction.mockImplementation(async (fn: Function) => {
      const txPrisma = {
        job: { update: jest.fn().mockResolvedValue(makeJobRow()) },
        jobStatusHistory: { create: mockHistoryCreate },
      };
      return fn(txPrisma);
    });

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      { body: { statusId: STATUS_APPLIED_ID, note: "Applied via API" } },
    );
    await changeStatus(req, routeCtx(VALID_UUID));

    expect(mockHistoryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: VALID_UUID,
        userId: "test-user-id",
        previousStatusId: STATUS_BOOKMARKED_ID,
        newStatusId: STATUS_APPLIED_ID,
        note: "Applied via API",
      }),
    });
  });

  it("returns 400 for invalid transition (bookmarked -> offer)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({
      id: VALID_UUID,
      statusId: STATUS_BOOKMARKED_ID,
      appliedDate: null,
      Status: { value: "bookmarked" },
    });
    mockPrisma.jobStatus.findFirst.mockResolvedValue({
      id: STATUS_OFFER_ID,
      value: "offer",
    });

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      { body: { statusId: STATUS_OFFER_ID } },
    );
    const res = asRes(await changeStatus(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("api.statusChange.invalidTransition");
  });

  it("returns 400 when statusId is missing", async () => {
    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      { body: {} },
    );
    const res = asRes(await changeStatus(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when statusId is not a valid UUID", async () => {
    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      { body: { statusId: "not-a-uuid" } },
    );
    const res = asRes(await changeStatus(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 for stale state (expectedFromStatusId mismatch)", async () => {
    const STALE_STATUS_ID = "44444444-4444-4444-a444-444444444444";

    mockPrisma.job.findFirst.mockResolvedValue({
      id: VALID_UUID,
      statusId: STATUS_APPLIED_ID, // actual current status
      appliedDate: null,
      Status: { value: "applied" },
    });
    mockPrisma.jobStatus.findFirst.mockResolvedValue({
      id: STATUS_OFFER_ID,
      value: "offer",
    });

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      {
        body: {
          statusId: STATUS_OFFER_ID,
          expectedFromStatusId: STALE_STATUS_ID, // caller thinks status is still this
        },
      },
    );
    const res = asRes(await changeStatus(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toBe("api.statusChange.staleState");
  });

  it("returns 404 when job does not exist (IDOR)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(null); // not found / not owned
    mockPrisma.jobStatus.findFirst.mockResolvedValue({
      id: STATUS_APPLIED_ID,
      value: "applied",
    });

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      { body: { statusId: STATUS_APPLIED_ID } },
    );
    const res = asRes(await changeStatus(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("scopes job lookup to userId (IDOR ownership check)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(null);
    mockPrisma.jobStatus.findFirst.mockResolvedValue({
      id: STATUS_APPLIED_ID,
      value: "applied",
    });

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      { body: { statusId: STATUS_APPLIED_ID } },
    );
    await changeStatus(req, routeCtx(VALID_UUID));

    expect(mockPrisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_UUID, userId: "test-user-id" },
      }),
    );
  });

  it("returns 400 when target status ID does not exist", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({
      id: VALID_UUID,
      statusId: STATUS_BOOKMARKED_ID,
      appliedDate: null,
      Status: { value: "bookmarked" },
    });
    mockPrisma.jobStatus.findFirst.mockResolvedValue(null); // no such status

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      { body: { statusId: STATUS_APPLIED_ID } },
    );
    const res = asRes(await changeStatus(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("api.statusChange.invalidStatus");
  });

  it("returns 400 for invalid UUID in route param", async () => {
    const req = mockRequest(
      "http://localhost/api/v1/jobs/not-a-uuid/status",
      { body: { statusId: STATUS_APPLIED_ID } },
    );
    const res = asRes(await changeStatus(req, routeCtx("not-a-uuid")));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = {
      url: `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      method: "POST",
      json: jest.fn().mockRejectedValue(new Error("bad json")),
      headers: { get: () => null },
    } as any;

    const res = asRes(await changeStatus(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("Invalid JSON body");
  });

  it("returns 400 when note exceeds 500 characters", async () => {
    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      { body: { statusId: STATUS_APPLIED_ID, note: "x".repeat(501) } },
    );
    const res = asRes(await changeStatus(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("passes null note to history when note is not provided", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({
      id: VALID_UUID,
      statusId: STATUS_BOOKMARKED_ID,
      appliedDate: null,
      Status: { value: "bookmarked" },
    });
    mockPrisma.jobStatus.findFirst.mockResolvedValue({
      id: STATUS_APPLIED_ID,
      value: "applied",
    });

    const mockHistoryCreate = jest.fn().mockResolvedValue({ id: "hist-1" });
    mockTransaction.mockImplementation(async (fn: Function) => {
      const txPrisma = {
        job: { update: jest.fn().mockResolvedValue(makeJobRow()) },
        jobStatusHistory: { create: mockHistoryCreate },
      };
      return fn(txPrisma);
    });

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/status`,
      { body: { statusId: STATUS_APPLIED_ID } },
    );
    await changeStatus(req, routeCtx(VALID_UUID));

    expect(mockHistoryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        note: null,
      }),
    });
  });
});
