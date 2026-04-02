/**
 * Functional tests for Public API v1 — Jobs & Notes route handlers.
 *
 * TG-4: 8 endpoints with zero test coverage.
 * Tests: IDOR ownership, input validation (Zod schemas), happy paths,
 * 404 handling, UUID validation, and pagination.
 *
 * Strategy: mock withApiAuth to bypass auth/rate-limit, mock @/lib/db (prisma)
 * to verify query shapes and ownership filters. NextResponse is stubbed with
 * a lightweight class following the pattern from public-api-response.spec.ts.
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
// prisma mock — defined inside factory to survive jest.mock hoisting
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    job: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    note: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    interview: {
      deleteMany: jest.fn(),
    },
    jobTitle: { upsert: jest.fn() },
    company: { upsert: jest.fn() },
    location: { upsert: jest.fn() },
    jobSource: { upsert: jest.fn() },
    jobStatus: { findFirst: jest.fn() },
    resume: { findFirst: jest.fn() },
    tag: { count: jest.fn() },
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import db from "@/lib/db";

import {
  GET as listJobs,
  POST as createJob,
} from "@/app/api/v1/jobs/route";

import {
  GET as getJob,
  PATCH as patchJob,
  DELETE as deleteJob,
} from "@/app/api/v1/jobs/[id]/route";

import {
  GET as listNotes,
  POST as createNote,
} from "@/app/api/v1/jobs/[id]/notes/route";

// Typed reference to the mocked prisma client
const mockPrisma = db as unknown as {
  job: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
  note: { findMany: jest.Mock; count: jest.Mock; create: jest.Mock };
  interview: { deleteMany: jest.Mock };
  jobTitle: { upsert: jest.Mock };
  company: { upsert: jest.Mock };
  location: { upsert: jest.Mock };
  jobSource: { upsert: jest.Mock };
  jobStatus: { findFirst: jest.Mock };
  resume: { findFirst: jest.Mock };
  tag: { count: jest.Mock };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const VALID_UUID_2 = "b2c3d4e5-f6a7-4891-abce-f12345678901";

function mockRequest(
  url: string,
  options?: { method?: string; body?: unknown },
) {
  return {
    url,
    method: options?.method ?? "GET",
    json: options?.body
      ? jest.fn().mockResolvedValue(options.body)
      : jest.fn().mockRejectedValue(new Error("no body")),
    headers: { get: () => null },
  } as any;
}

function routeCtx(id?: string) {
  if (!id) return {};
  return { params: Promise.resolve({ id }) };
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
    Status: { id: "st-1", label: "Draft", value: "draft" },
    Location: null,
    JobSource: null,
    tags: [],
    _count: { Notes: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Default: upserts return an id
  mockPrisma.jobTitle.upsert.mockResolvedValue({ id: "jt-1" });
  mockPrisma.company.upsert.mockResolvedValue({ id: "co-1" });
  mockPrisma.location.upsert.mockResolvedValue({ id: "loc-1" });
  mockPrisma.jobSource.upsert.mockResolvedValue({ id: "src-1" });
  mockPrisma.jobStatus.findFirst.mockResolvedValue({ id: "st-draft" });
});

// =========================================================================
// GET /api/v1/jobs — List jobs
// =========================================================================

describe("GET /api/v1/jobs", () => {
  it("returns paginated jobs with correct meta (happy path)", async () => {
    const rows = [makeJobRow(), makeJobRow({ id: VALID_UUID_2 })];
    mockPrisma.job.findMany.mockResolvedValue(rows);
    mockPrisma.job.count.mockResolvedValue(2);

    const req = mockRequest("http://localhost/api/v1/jobs?page=1&perPage=25");
    const res = asRes(await listJobs(req, routeCtx()));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({
      total: 2,
      page: 1,
      perPage: 25,
      totalPages: 1,
    });
  });

  it("scopes query to authenticated userId (IDOR)", async () => {
    mockPrisma.job.findMany.mockResolvedValue([]);
    mockPrisma.job.count.mockResolvedValue(0);

    const req = mockRequest("http://localhost/api/v1/jobs");
    await listJobs(req, routeCtx());

    expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "test-user-id" }),
      }),
    );
    expect(mockPrisma.job.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "test-user-id" }),
      }),
    );
  });

  it("applies filter and search params", async () => {
    mockPrisma.job.findMany.mockResolvedValue([]);
    mockPrisma.job.count.mockResolvedValue(0);

    const req = mockRequest(
      "http://localhost/api/v1/jobs?filter=applied&search=Engineer",
    );
    await listJobs(req, routeCtx());

    const where = mockPrisma.job.findMany.mock.calls[0][0].where;
    expect(where.Status).toEqual({ value: "applied" });
    expect(where.OR).toBeDefined();
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ JobTitle: { label: { contains: "Engineer", mode: "insensitive" } } }),
      ]),
    );
  });

  it("returns 400 for invalid perPage value", async () => {
    const req = mockRequest("http://localhost/api/v1/jobs?perPage=999");
    const res = asRes(await listJobs(req, routeCtx()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("uses defaults when page/perPage are omitted", async () => {
    mockPrisma.job.findMany.mockResolvedValue([]);
    mockPrisma.job.count.mockResolvedValue(0);

    const req = mockRequest("http://localhost/api/v1/jobs");
    const res = asRes(await listJobs(req, routeCtx()));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.page).toBe(1);
    expect(body.meta.perPage).toBe(25);
  });
});

// =========================================================================
// POST /api/v1/jobs — Create job
// =========================================================================

describe("POST /api/v1/jobs", () => {
  it("creates a job and returns 201 (happy path)", async () => {
    const createdJob = makeJobRow();
    mockPrisma.job.create.mockResolvedValue(createdJob);

    const req = mockRequest("http://localhost/api/v1/jobs", {
      method: "POST",
      body: { title: "Engineer", company: "Acme" },
    });
    const res = asRes(await createJob(req, routeCtx()));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(VALID_UUID);
  });

  it("passes userId to prisma.job.create (IDOR)", async () => {
    mockPrisma.job.create.mockResolvedValue(makeJobRow());

    const req = mockRequest("http://localhost/api/v1/jobs", {
      method: "POST",
      body: { title: "Dev", company: "Co" },
    });
    await createJob(req, routeCtx());

    expect(mockPrisma.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "test-user-id" }),
      }),
    );
  });

  it("returns 400 when title is missing", async () => {
    const req = mockRequest("http://localhost/api/v1/jobs", {
      method: "POST",
      body: { company: "Acme" },
    });
    const res = asRes(await createJob(req, routeCtx()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when company is missing", async () => {
    const req = mockRequest("http://localhost/api/v1/jobs", {
      method: "POST",
      body: { title: "Dev" },
    });
    const res = asRes(await createJob(req, routeCtx()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = {
      url: "http://localhost/api/v1/jobs",
      method: "POST",
      json: jest.fn().mockRejectedValue(new Error("bad json")),
      headers: { get: () => null },
    } as any;

    const res = asRes(await createJob(req, routeCtx()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("Invalid JSON body");
  });

  it("returns 400 when title exceeds max length", async () => {
    const req = mockRequest("http://localhost/api/v1/jobs", {
      method: "POST",
      body: { title: "x".repeat(501), company: "Acme" },
    });
    const res = asRes(await createJob(req, routeCtx()));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("validates resume ownership (IDOR) and rejects foreign resume", async () => {
    mockPrisma.resume.findFirst.mockResolvedValue(null); // not owned

    const req = mockRequest("http://localhost/api/v1/jobs", {
      method: "POST",
      body: { title: "Dev", company: "Co", resume: VALID_UUID },
    });
    const res = asRes(await createJob(req, routeCtx()));

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("Invalid resume ID");

    // Verify ownership query shape
    expect(mockPrisma.resume.findFirst).toHaveBeenCalledWith({
      where: { id: VALID_UUID, profile: { userId: "test-user-id" } },
      select: { id: true },
    });
  });

  it("validates tag ownership (IDOR) and rejects foreign tags", async () => {
    mockPrisma.tag.count.mockResolvedValue(1); // only 1 of 2 tags owned

    const req = mockRequest("http://localhost/api/v1/jobs", {
      method: "POST",
      body: { title: "Dev", company: "Co", tags: [VALID_UUID, VALID_UUID_2] },
    });
    const res = asRes(await createJob(req, routeCtx()));

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("One or more invalid tag IDs");
  });
});

// =========================================================================
// GET /api/v1/jobs/:id — Get single job
// =========================================================================

describe("GET /api/v1/jobs/:id", () => {
  it("returns the job with full details (happy path)", async () => {
    const job = makeJobRow({ Resume: null, _count: { Notes: 3 } });
    mockPrisma.job.findFirst.mockResolvedValue(job);

    const req = mockRequest(`http://localhost/api/v1/jobs/${VALID_UUID}`);
    const res = asRes(await getJob(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(VALID_UUID);
  });

  it("scopes findFirst to userId (IDOR)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(makeJobRow());

    const req = mockRequest(`http://localhost/api/v1/jobs/${VALID_UUID}`);
    await getJob(req, routeCtx(VALID_UUID));

    expect(mockPrisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_UUID, userId: "test-user-id" },
      }),
    );
  });

  it("returns 404 when job does not exist", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(null);

    const req = mockRequest(`http://localhost/api/v1/jobs/${VALID_UUID}`);
    const res = asRes(await getJob(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for invalid UUID format", async () => {
    const req = mockRequest("http://localhost/api/v1/jobs/not-a-uuid");
    const res = asRes(await getJob(req, routeCtx("not-a-uuid")));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

// =========================================================================
// PATCH /api/v1/jobs/:id — Update job
// =========================================================================

describe("PATCH /api/v1/jobs/:id", () => {
  it("updates a job and returns 200 (happy path)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });
    const updatedJob = makeJobRow({ jobType: "Part-time" });
    mockPrisma.job.update.mockResolvedValue(updatedJob);

    const req = mockRequest(`http://localhost/api/v1/jobs/${VALID_UUID}`, {
      method: "PATCH",
      body: { type: "Part-time" },
    });
    const res = asRes(await patchJob(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("verifies ownership before update (IDOR)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(null); // not owned

    const req = mockRequest(`http://localhost/api/v1/jobs/${VALID_UUID}`, {
      method: "PATCH",
      body: { type: "Part-time" },
    });
    const res = asRes(await patchJob(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(404);
    expect(mockPrisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_UUID, userId: "test-user-id" },
      }),
    );
  });

  it("returns 400 for invalid UUID format", async () => {
    const req = mockRequest("http://localhost/api/v1/jobs/bad-id", {
      method: "PATCH",
      body: { type: "Part-time" },
    });
    const res = asRes(await patchJob(req, routeCtx("bad-id")));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when status value is invalid (status not found in DB)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });
    mockPrisma.jobStatus.findFirst.mockResolvedValue(null); // unknown status

    const req = mockRequest(`http://localhost/api/v1/jobs/${VALID_UUID}`, {
      method: "PATCH",
      body: { status: "nonexistent_status" },
    });
    const res = asRes(await patchJob(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("Invalid job status");
  });

  it("returns 400 for invalid JSON body", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });

    const req = {
      url: `http://localhost/api/v1/jobs/${VALID_UUID}`,
      method: "PATCH",
      json: jest.fn().mockRejectedValue(new Error("bad json")),
      headers: { get: () => null },
    } as any;

    const res = asRes(await patchJob(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("Invalid JSON body");
  });

  it("resolves title and company via findOrCreate on PATCH", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });
    mockPrisma.job.update.mockResolvedValue(makeJobRow());

    const req = mockRequest(`http://localhost/api/v1/jobs/${VALID_UUID}`, {
      method: "PATCH",
      body: { title: "New Title", company: "New Co" },
    });
    await patchJob(req, routeCtx(VALID_UUID));

    expect(mockPrisma.jobTitle.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { value_createdBy: { value: "new title", createdBy: "test-user-id" } },
      }),
    );
    expect(mockPrisma.company.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { value_createdBy: { value: "new co", createdBy: "test-user-id" } },
      }),
    );
  });
});

// =========================================================================
// DELETE /api/v1/jobs/:id — Delete job
// =========================================================================

describe("DELETE /api/v1/jobs/:id", () => {
  it("deletes a job and returns 204 (happy path)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({
      id: VALID_UUID,
      _count: { Interview: 0 },
    });
    mockPrisma.interview.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.job.delete.mockResolvedValue({});

    const req = mockRequest(`http://localhost/api/v1/jobs/${VALID_UUID}`, {
      method: "DELETE",
    });
    const res = asRes(await deleteJob(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it("verifies ownership before delete (IDOR)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(null); // not owned

    const req = mockRequest(`http://localhost/api/v1/jobs/${VALID_UUID}`, {
      method: "DELETE",
    });
    const res = asRes(await deleteJob(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(404);
    expect(mockPrisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_UUID, userId: "test-user-id" },
      }),
    );
  });

  it("returns 400 for invalid UUID format", async () => {
    const req = mockRequest("http://localhost/api/v1/jobs/xyz", {
      method: "DELETE",
    });
    const res = asRes(await deleteJob(req, routeCtx("xyz")));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("deletes related interviews before the job", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({
      id: VALID_UUID,
      _count: { Interview: 2 },
    });
    mockPrisma.interview.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.job.delete.mockResolvedValue({});

    const req = mockRequest(`http://localhost/api/v1/jobs/${VALID_UUID}`, {
      method: "DELETE",
    });
    await deleteJob(req, routeCtx(VALID_UUID));

    // interview.deleteMany is called before job.delete
    const deleteManyCalls = mockPrisma.interview.deleteMany.mock.invocationCallOrder[0];
    const jobDeleteCalls = mockPrisma.job.delete.mock.invocationCallOrder[0];
    expect(deleteManyCalls).toBeLessThan(jobDeleteCalls);

    // interview deleteMany scoped by userId (defense-in-depth)
    expect(mockPrisma.interview.deleteMany).toHaveBeenCalledWith({
      where: { jobId: VALID_UUID, job: { userId: "test-user-id" } },
    });
  });
});

// =========================================================================
// GET /api/v1/jobs/:id/notes — List notes
// =========================================================================

describe("GET /api/v1/jobs/:id/notes", () => {
  it("returns paginated notes (happy path)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });
    const notes = [
      { id: "n-1", content: "Note 1", createdAt: new Date(), updatedAt: new Date() },
      { id: "n-2", content: "Note 2", createdAt: new Date(), updatedAt: new Date() },
    ];
    mockPrisma.note.findMany.mockResolvedValue(notes);
    mockPrisma.note.count.mockResolvedValue(2);

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/notes?page=1&perPage=10`,
    );
    const res = asRes(await listNotes(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.meta.total).toBe(2);
  });

  it("verifies job ownership before listing notes (IDOR)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(null); // not owned

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/notes`,
    );
    const res = asRes(await listNotes(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(404);
    expect(mockPrisma.job.findFirst).toHaveBeenCalledWith({
      where: { id: VALID_UUID, userId: "test-user-id" },
      select: { id: true },
    });
  });

  it("scopes note queries to userId (IDOR)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });
    mockPrisma.note.findMany.mockResolvedValue([]);
    mockPrisma.note.count.mockResolvedValue(0);

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/notes`,
    );
    await listNotes(req, routeCtx(VALID_UUID));

    expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobId: VALID_UUID, userId: "test-user-id" },
      }),
    );
    expect(mockPrisma.note.count).toHaveBeenCalledWith({
      where: { jobId: VALID_UUID, userId: "test-user-id" },
    });
  });

  it("returns 400 for invalid UUID format", async () => {
    const req = mockRequest("http://localhost/api/v1/jobs/bad-uuid/notes");
    const res = asRes(await listNotes(req, routeCtx("bad-uuid")));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

// =========================================================================
// POST /api/v1/jobs/:id/notes — Create note
// =========================================================================

describe("POST /api/v1/jobs/:id/notes", () => {
  it("creates a note and returns 201 (happy path)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });
    const createdNote = {
      id: "note-1",
      content: "My note",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPrisma.note.create.mockResolvedValue(createdNote);

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/notes`,
      { method: "POST", body: { content: "My note" } },
    );
    const res = asRes(await createNote(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.content).toBe("My note");
  });

  it("verifies job ownership before creating note (IDOR)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(null); // not owned

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/notes`,
      { method: "POST", body: { content: "Note" } },
    );
    const res = asRes(await createNote(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(404);
  });

  it("sets userId on the created note (IDOR)", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });
    mockPrisma.note.create.mockResolvedValue({
      id: "n-1",
      content: "Test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/notes`,
      { method: "POST", body: { content: "Test" } },
    );
    await createNote(req, routeCtx(VALID_UUID));

    expect(mockPrisma.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "test-user-id",
          jobId: VALID_UUID,
        }),
      }),
    );
  });

  it("returns 400 when content is missing", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/notes`,
      { method: "POST", body: {} },
    );
    const res = asRes(await createNote(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when content is empty string", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/notes`,
      { method: "POST", body: { content: "" } },
    );
    const res = asRes(await createNote(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
  });

  it("returns 400 when content exceeds max length", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });

    const req = mockRequest(
      `http://localhost/api/v1/jobs/${VALID_UUID}/notes`,
      { method: "POST", body: { content: "x".repeat(10_001) } },
    );
    const res = asRes(await createNote(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockPrisma.job.findFirst.mockResolvedValue({ id: VALID_UUID });

    const req = {
      url: `http://localhost/api/v1/jobs/${VALID_UUID}/notes`,
      method: "POST",
      json: jest.fn().mockRejectedValue(new Error("bad json")),
      headers: { get: () => null },
    } as any;

    const res = asRes(await createNote(req, routeCtx(VALID_UUID)));

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("Invalid JSON body");
  });

  it("returns 400 for invalid UUID in route param", async () => {
    const req = mockRequest(
      "http://localhost/api/v1/jobs/not-valid/notes",
      { method: "POST", body: { content: "Note" } },
    );
    const res = asRes(await createNote(req, routeCtx("not-valid")));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
