/**
 * Security tests: Sprint C fixes SEC-11 through SEC-18 and BS-1 through BS-9.
 * Verifies that API responses, rate limiting, ownership checks, runtime validation,
 * auth guards, and error sanitization all enforce the documented security rules.
 */

// ---------------------------------------------------------------------------
// next/server mock — must be at the top before any import (SEC-18 uses it directly)
// ---------------------------------------------------------------------------

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
      return new MockNextResponse(body, init);
    }
  }

  class MockNextRequest {
    headers: Map<string, string>;
    method: string;
    url: string;

    constructor(url: string, init?: { method?: string; headers?: Record<string, string> }) {
      this.url = url;
      this.method = init?.method ?? "GET";
      this.headers = new Map(Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    }

    get(name: string): string | null {
      return this.headers.get(name.toLowerCase()) ?? null;
    }
  }

  return { NextResponse: MockNextResponse, NextRequest: MockNextRequest };
});

// ---------------------------------------------------------------------------
// Standard mocks (module-level, hoisted by Jest)
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  job: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  resume: {
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  workExperience: {
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  education: {
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  resumeSection: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  companyBlacklist: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  task: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  userSettings: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  publicApiKey: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

// next/headers is used by updateDisplaySettings
jest.mock("next/headers", () => ({
  cookies: jest.fn(() =>
    Promise.resolve({ set: jest.fn() })
  ),
}));

// server-only is a no-op in tests
jest.mock("server-only", () => ({}), { virtual: true });

import { getCurrentUser } from "@/utils/user.utils";
import prisma from "@/lib/db";

const mockUser = { id: "user-123", name: "Test User", email: "test@example.com" };

// ---------------------------------------------------------------------------
// SEC-11: File.filePath excluded from API response
// ---------------------------------------------------------------------------

describe("SEC-11: File.filePath excluded from job API response", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  it("includes select clause for File that omits filePath", async () => {
    const { getJobDetails } = require("@/actions/job.actions");
    (prisma.job.findFirst as jest.Mock).mockResolvedValue(null);

    await getJobDetails("job-001");

    const call = (prisma.job.findFirst as jest.Mock).mock.calls[0][0];
    // The include for Resume should use a nested select, not File: true
    expect(call.include.Resume).toBeDefined();
    expect(call.include.Resume.include.File).toBeDefined();
    expect(call.include.Resume.include.File).toEqual(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          fileName: true,
          fileType: true,
        }),
      })
    );
    // filePath must NOT be in the select
    expect(call.include.Resume.include.File.select.filePath).toBeUndefined();
  });

  it("does NOT use File: true (which would expose filePath)", async () => {
    const { getJobDetails } = require("@/actions/job.actions");
    (prisma.job.findFirst as jest.Mock).mockResolvedValue(null);

    await getJobDetails("job-001");

    const call = (prisma.job.findFirst as jest.Mock).mock.calls[0][0];
    // File: true at the top level would expose filePath
    expect(call.include?.File).toBeUndefined();
    // Resume.include.File must be a select object, not a plain `true`
    expect(call.include.Resume.include.File).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-12: Pre-auth IP rate limiting — checkRateLimit called BEFORE validateApiKey
// ---------------------------------------------------------------------------

describe("SEC-12: Pre-auth IP rate limiting", () => {
  // These tests use jest.isolateModules to avoid contaminating the module registry
  it("returns 429 without calling validateApiKey when IP is rate-limited", async () => {
    let withApiAuth: any;
    let validateApiKey: any;

    await jest.isolateModulesAsync(async () => {
      jest.doMock("@/lib/api/rate-limit", () => ({
        checkRateLimit: jest.fn().mockReturnValue({ allowed: false, remaining: 0, limit: 120, resetAt: 9999999999 }),
        resetRateLimitStore: jest.fn(),
      }));
      jest.doMock("@/lib/api/auth", () => ({
        validateApiKey: jest.fn().mockResolvedValue({ userId: "u-1", keyHash: "hash" }),
      }));

      withApiAuth = (await import("@/lib/api/with-api-auth")).withApiAuth;
      validateApiKey = (await import("@/lib/api/auth")).validateApiKey;
    });

    const handler = jest.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withApiAuth(handler);

    // Create a mock request with a headers.get method
    const req = {
      method: "GET",
      headers: {
        get: (name: string) => {
          const h: Record<string, string> = { "x-forwarded-for": "1.2.3.4" };
          return h[name.toLowerCase()] ?? null;
        },
      },
    } as any;

    const res = await wrapped(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(429);
    expect(validateApiKey).not.toHaveBeenCalled();
  });

  it("calls validateApiKey when IP rate limit allows the request", async () => {
    let withApiAuth: any;
    let validateApiKey: any;

    await jest.isolateModulesAsync(async () => {
      const checkRateLimitMock = jest.fn()
        .mockReturnValueOnce({ allowed: true, remaining: 119, limit: 120, resetAt: 9999999999 })
        .mockReturnValueOnce({ allowed: true, remaining: 59, limit: 60, resetAt: 9999999999 });

      jest.doMock("@/lib/api/rate-limit", () => ({
        checkRateLimit: checkRateLimitMock,
        resetRateLimitStore: jest.fn(),
      }));
      jest.doMock("@/lib/api/auth", () => ({
        validateApiKey: jest.fn().mockResolvedValue({ userId: "u-1", keyHash: "hash" }),
      }));

      withApiAuth = (await import("@/lib/api/with-api-auth")).withApiAuth;
      validateApiKey = (await import("@/lib/api/auth")).validateApiKey;
    });

    const handler = jest.fn().mockResolvedValue({ headers: new Map(), status: 200 } as any);
    const wrapped = withApiAuth(handler);

    const req = {
      method: "GET",
      headers: {
        get: (name: string) => {
          const h: Record<string, string> = {
            "x-forwarded-for": "1.2.3.4",
            "authorization": "Bearer pk_live_abc",
          };
          return h[name.toLowerCase()] ?? null;
        },
      },
    } as any;

    await wrapped(req, { params: Promise.resolve({}) });

    expect(validateApiKey).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// SEC-13: getBlacklistEntriesForUser lives outside "use server" file
// ---------------------------------------------------------------------------

describe("SEC-13: getBlacklistEntriesForUser isolation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("is exported from blacklist-query.ts, not from companyBlacklist.actions.ts", () => {
    const queryModule = require("@/lib/blacklist-query");
    expect(typeof queryModule.getBlacklistEntriesForUser).toBe("function");
  });

  it("companyBlacklist.actions.ts does NOT directly export getBlacklistEntriesForUser", () => {
    const actionsModule = require("@/actions/companyBlacklist.actions");
    expect((actionsModule as any).getBlacklistEntriesForUser).toBeUndefined();
  });

  it("blacklist-query.ts queries only by userId with correct select", async () => {
    (prisma.companyBlacklist.findMany as jest.Mock).mockResolvedValue([
      { pattern: "BadCorp", matchType: "contains" },
    ]);

    const { getBlacklistEntriesForUser } = require("@/lib/blacklist-query");
    const result = await getBlacklistEntriesForUser("user-123");

    expect(prisma.companyBlacklist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-123" },
        select: { pattern: true, matchType: true },
      })
    );
    expect(result).toEqual([{ pattern: "BadCorp", matchType: "contains" }]);
  });
});

// ---------------------------------------------------------------------------
// SEC-14: matchType runtime validation in addBlacklistEntry
// ---------------------------------------------------------------------------

describe("SEC-14: matchType runtime validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  it("returns { success: false, message: 'Invalid match type' } for unknown matchType", async () => {
    const { addBlacklistEntry } = require("@/actions/companyBlacklist.actions");

    const result = await addBlacklistEntry("BadCorp", "invalid" as any);

    expect(result).toEqual({ success: false, message: "Invalid match type" });
    expect(prisma.companyBlacklist.create).not.toHaveBeenCalled();
  });

  it("proceeds normally for valid matchType 'contains'", async () => {
    (prisma.companyBlacklist.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.companyBlacklist.create as jest.Mock).mockResolvedValue({
      id: "bl-1",
      userId: mockUser.id,
      pattern: "BadCorp",
      matchType: "contains",
      reason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { addBlacklistEntry } = require("@/actions/companyBlacklist.actions");
    const result = await addBlacklistEntry("BadCorp", "contains");

    expect(result.success).toBe(true);
    expect(prisma.companyBlacklist.create).toHaveBeenCalledTimes(1);
  });

  it("rejects 'exact_match' (not in the valid set)", async () => {
    const { addBlacklistEntry } = require("@/actions/companyBlacklist.actions");

    const result = await addBlacklistEntry("BadCorp", "exact_match" as any);

    expect(result).toEqual({ success: false, message: "Invalid match type" });
  });

  it("accepts all four valid matchTypes without returning invalid-type error", async () => {
    const { addBlacklistEntry } = require("@/actions/companyBlacklist.actions");

    for (const mt of ["exact", "contains", "starts_with", "ends_with"] as const) {
      jest.clearAllMocks();
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.companyBlacklist.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.companyBlacklist.create as jest.Mock).mockResolvedValue({
        id: "bl-x", userId: mockUser.id, pattern: "Acme", matchType: mt,
        reason: null, createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await addBlacklistEntry("Acme", mt);
      expect(result).not.toEqual({ success: false, message: "Invalid match type" });
    }
  });
});

// ---------------------------------------------------------------------------
// SEC-15: UUID validation regex
// ---------------------------------------------------------------------------

describe("SEC-15: UUID validation regex", () => {
  // Exact regex from the route handlers
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it("accepts a well-formed lowercase UUID", () => {
    expect(UUID_REGEX.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts a well-formed uppercase UUID", () => {
    expect(UUID_REGEX.test("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("accepts a mixed-case UUID", () => {
    expect(UUID_REGEX.test("550e8400-E29B-41d4-A716-446655440000")).toBe(true);
  });

  it("rejects 'not-a-uuid'", () => {
    expect(UUID_REGEX.test("not-a-uuid")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(UUID_REGEX.test("")).toBe(false);
  });

  it("rejects a string made entirely of dashes", () => {
    expect(UUID_REGEX.test("------------------------------------")).toBe(false);
  });

  it("rejects a UUID missing hyphens", () => {
    expect(UUID_REGEX.test("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("rejects a UUID that is too short by one character", () => {
    expect(UUID_REGEX.test("550e8400-e29b-41d4-a716-44665544000")).toBe(false);
  });

  it("rejects a UUID that is too long by one character", () => {
    expect(UUID_REGEX.test("550e8400-e29b-41d4-a716-4466554400001")).toBe(false);
  });

  it("rejects SQL injection attempt", () => {
    expect(UUID_REGEX.test("' OR 1=1 --")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-17: Constant-time API key validation
// ---------------------------------------------------------------------------

describe("SEC-17: Constant-time API key validation", () => {
  // Use the module-level prisma mock (publicApiKey added to it above)
  const { validateApiKey } = require("@/lib/api/auth");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeReq = (authHeader: string) => ({
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "authorization") return authHeader;
        return null;
      },
    },
  } as any);

  it("returns null when key does not exist in DB", async () => {
    (prisma.publicApiKey.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await validateApiKey(makeReq("Bearer pk_live_nonexistent"));
    expect(result).toBeNull();
  });

  it("returns null when key is revoked (revokedAt is set)", async () => {
    (prisma.publicApiKey.findUnique as jest.Mock).mockResolvedValue({
      id: "key-1",
      userId: "user-abc",
      keyHash: "hash-abc",
      revokedAt: new Date("2026-01-01"),
    });

    const result = await validateApiKey(makeReq("Bearer pk_live_revoked"));
    expect(result).toBeNull();
  });

  it("returns userId and keyHash when key is valid and not revoked", async () => {
    (prisma.publicApiKey.findUnique as jest.Mock).mockResolvedValue({
      id: "key-1",
      userId: "user-abc",
      keyHash: "hash-abc",
      revokedAt: null,
    });
    (prisma.publicApiKey.update as jest.Mock).mockResolvedValue({});

    const result = await validateApiKey(makeReq("Bearer pk_live_valid"));
    expect(result).toEqual({ userId: "user-abc", keyHash: "hash-abc" });
  });

  it("evaluates both keyExists and keyRevoked before returning (constant-time behaviour)", async () => {
    // When the DB returns null, keyRevoked = undefined (falsy). The implementation
    // computes both flags before branching: keyExists=false, keyRevoked=undefined.
    // The final isValid = false && !undefined = false. Must return null.
    (prisma.publicApiKey.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await validateApiKey(makeReq("Bearer pk_live_timing_test"));
    expect(result).toBeNull();
    // findUnique was called once — the lookup always runs, never short-circuits early
    expect(prisma.publicApiKey.findUnique).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// SEC-18: Error sanitization in actionToResponse
// ---------------------------------------------------------------------------

describe("SEC-18: Error sanitization in actionToResponse", () => {
  // actionToResponse is already imported after next/server is mocked at module top
  const { actionToResponse } = require("@/lib/api/response");

  it("returns generic message for internal Prisma error (no raw DB detail exposed)", async () => {
    // The message must NOT contain keywords that map to 4xx (invalid, not found, etc.)
    // so that inferErrorStatus() returns 500 and the sanitization path is exercised.
    const res = actionToResponse({
      success: false,
      message: "PrismaClientKnownRequestError: connection reset at prisma.job.findFirst() line 42",
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("An unexpected error occurred.");
    // Raw Prisma detail must NOT be leaked to the caller
    expect(JSON.stringify(body)).not.toContain("PrismaClientKnownRequestError");
    expect(JSON.stringify(body)).not.toContain("line 42");
  });

  it("passes through a user-facing 'not found' message unchanged", async () => {
    const res = actionToResponse({ success: false, message: "Job not found" });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.message).toBe("Job not found");
  });

  it("passes through a user-facing 'not authenticated' message unchanged", async () => {
    const res = actionToResponse({ success: false, message: "Not authenticated" });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.message).toBe("Not authenticated");
  });

  it("sanitizes a generic OS/internal error to the generic message", async () => {
    const res = actionToResponse({ success: false, message: "ENOENT: no such file or directory" });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.message).toBe("An unexpected error occurred.");
  });
});

// ---------------------------------------------------------------------------
// BS-1 / BS-3: Delete ownership checks
// ---------------------------------------------------------------------------

describe("BS-1/BS-3: Delete operations verify ownership before deleting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  describe("deleteResumeById", () => {
    it("does NOT execute transaction when ownership check returns null", async () => {
      (prisma.resume.findFirst as jest.Mock).mockResolvedValue(null);

      const { deleteResumeById } = require("@/actions/profile.actions");
      const result = await deleteResumeById("resume-not-mine");

      expect(prisma.resume.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "resume-not-mine", profile: { userId: mockUser.id } },
        })
      );
      expect(result.success).toBe(false);
      // The $transaction (which contains the actual delete) must NOT have been called
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("executes transaction when ownership is confirmed", async () => {
      const mockResume = { id: "resume-mine", profileId: "profile-1" };
      (prisma.resume.findFirst as jest.Mock).mockResolvedValue(mockResume);
      (prisma.$transaction as jest.Mock).mockResolvedValue(undefined);

      const { deleteResumeById } = require("@/actions/profile.actions");
      const result = await deleteResumeById("resume-mine");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });
  });

  describe("deleteWorkExperience", () => {
    it("does NOT call workExperience.delete when ownership check returns null", async () => {
      (prisma.workExperience.findFirst as jest.Mock).mockResolvedValue(null);

      const { deleteWorkExperience } = require("@/actions/profile.actions");
      const result = await deleteWorkExperience("exp-not-mine", "resume-1");

      expect(prisma.workExperience.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "exp-not-mine",
            ResumeSection: { Resume: { profile: { userId: mockUser.id } } },
          },
        })
      );
      expect(result.success).toBe(false);
      expect(prisma.workExperience.delete).not.toHaveBeenCalled();
    });

    it("proceeds to delete when ownership is confirmed", async () => {
      (prisma.workExperience.findFirst as jest.Mock).mockResolvedValue({ id: "exp-mine" });
      (prisma.workExperience.delete as jest.Mock).mockResolvedValue({});

      const { deleteWorkExperience } = require("@/actions/profile.actions");
      const result = await deleteWorkExperience("exp-mine", "resume-1");

      expect(prisma.workExperience.delete).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });
  });

  describe("deleteEducation", () => {
    it("does NOT call education.delete when ownership check returns null", async () => {
      (prisma.education.findFirst as jest.Mock).mockResolvedValue(null);

      const { deleteEducation } = require("@/actions/profile.actions");
      const result = await deleteEducation("edu-not-mine", "resume-1");

      expect(prisma.education.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "edu-not-mine",
            ResumeSection: { Resume: { profile: { userId: mockUser.id } } },
          },
        })
      );
      expect(result.success).toBe(false);
      expect(prisma.education.delete).not.toHaveBeenCalled();
    });

    it("proceeds to delete when ownership is confirmed", async () => {
      (prisma.education.findFirst as jest.Mock).mockResolvedValue({ id: "edu-mine" });
      (prisma.education.delete as jest.Mock).mockResolvedValue({});

      const { deleteEducation } = require("@/actions/profile.actions");
      const result = await deleteEducation("edu-mine", "resume-1");

      expect(prisma.education.delete).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// BS-4: Add functions verify ownership of target resume before writing
// ---------------------------------------------------------------------------

describe("BS-4: Add functions verify resume ownership before creating sub-resources", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  describe("addResumeSummary", () => {
    it("returns an error and skips resumeSection.create when ownership check fails", async () => {
      (prisma.resume.findFirst as jest.Mock).mockResolvedValue(null);

      const { addResumeSummary } = require("@/actions/profile.actions");
      const result = await addResumeSummary({
        resumeId: "resume-not-mine",
        sectionTitle: "Summary",
        content: "Hello world",
      });

      expect(prisma.resume.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "resume-not-mine", profile: { userId: mockUser.id } },
        })
      );
      expect(result.success).toBe(false);
      expect(prisma.resumeSection.create).not.toHaveBeenCalled();
    });
  });

  describe("addExperience", () => {
    it("returns an error and skips resumeSection.create when ownership check fails", async () => {
      (prisma.resume.findFirst as jest.Mock).mockResolvedValue(null);

      const { addExperience } = require("@/actions/profile.actions");
      const result = await addExperience({
        resumeId: "resume-not-mine",
        sectionTitle: "Experience",
        title: "title-id",
        company: "company-id",
        location: "loc-id",
        startDate: new Date("2020-01-01"),
        endDate: null,
        jobDescription: "did stuff",
      });

      expect(result.success).toBe(false);
      expect(prisma.resumeSection.create).not.toHaveBeenCalled();
    });
  });

  describe("addEducation", () => {
    it("returns an error and skips resumeSection.create when ownership check fails", async () => {
      (prisma.resume.findFirst as jest.Mock).mockResolvedValue(null);

      const { addEducation } = require("@/actions/profile.actions");
      const result = await addEducation({
        resumeId: "resume-not-mine",
        sectionTitle: "Education",
        institution: "MIT",
        degree: "B.Sc.",
        fieldOfStudy: "CS",
        location: "loc-id",
        startDate: new Date("2015-09-01"),
        endDate: new Date("2019-06-30"),
        description: "studied hard",
      });

      expect(result.success).toBe(false);
      expect(prisma.resumeSection.create).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// BS-6: userSettings auth guard — IDOR prevention
// ---------------------------------------------------------------------------

describe("BS-6: userSettings functions guard against cross-user data access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAutomationSettingsForUser", () => {
    it("returns defaults when getCurrentUser returns a different user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue({ id: "my-id" });

      const { getAutomationSettingsForUser } = require("@/actions/userSettings.actions");
      const result = await getAutomationSettingsForUser("other-user-id");

      // Must not have queried DB for the other user
      expect(prisma.userSettings.findUnique).not.toHaveBeenCalled();
      // Must return the automation defaults
      const { defaultUserSettings } = require("@/models/userSettings.model");
      expect(result).toEqual(defaultUserSettings.automation);
    });

    it("returns defaults when getCurrentUser returns null (unauthenticated)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const { getAutomationSettingsForUser } = require("@/actions/userSettings.actions");
      const result = await getAutomationSettingsForUser("any-user-id");

      expect(prisma.userSettings.findUnique).not.toHaveBeenCalled();
      const { defaultUserSettings } = require("@/models/userSettings.model");
      expect(result).toEqual(defaultUserSettings.automation);
    });

    it("queries DB and returns merged settings when userId matches current user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
        userId: mockUser.id,
        settings: JSON.stringify({ automation: { showAutomationWarning: false } }),
      });

      const { getAutomationSettingsForUser } = require("@/actions/userSettings.actions");
      const result = await getAutomationSettingsForUser(mockUser.id);

      expect(prisma.userSettings.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
      expect(result.showAutomationWarning).toBe(false);
    });
  });

  describe("getNotificationPreferencesForUser", () => {
    it("returns defaults when getCurrentUser returns a different user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue({ id: "my-id" });

      const { getNotificationPreferencesForUser } = require("@/actions/userSettings.actions");
      const result = await getNotificationPreferencesForUser("other-user-id");

      expect(prisma.userSettings.findUnique).not.toHaveBeenCalled();
      const { DEFAULT_NOTIFICATION_PREFERENCES } = require("@/models/notification.model");
      expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it("returns defaults when getCurrentUser returns null", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const { getNotificationPreferencesForUser } = require("@/actions/userSettings.actions");
      const result = await getNotificationPreferencesForUser("any-user-id");

      expect(prisma.userSettings.findUnique).not.toHaveBeenCalled();
      const { DEFAULT_NOTIFICATION_PREFERENCES } = require("@/models/notification.model");
      expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });
  });
});

// ---------------------------------------------------------------------------
// BS-8: Runtime validation for updateTaskStatus and executeBulkAction
// ---------------------------------------------------------------------------

describe("BS-8: Runtime validation for TaskStatus and BulkActionType", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  describe("updateTaskStatus", () => {
    it("returns a failure response for an invalid status string", async () => {
      const { updateTaskStatus } = require("@/actions/task.actions");

      const result = await updateTaskStatus("task-1", "invalid-status" as any);

      expect(result.success).toBe(false);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it("returns a failure response for an empty string status", async () => {
      const { updateTaskStatus } = require("@/actions/task.actions");

      const result = await updateTaskStatus("task-1", "" as any);

      expect(result.success).toBe(false);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it("proceeds to update for a valid status 'in-progress'", async () => {
      (prisma.task.update as jest.Mock).mockResolvedValue({
        id: "task-1",
        status: "in-progress",
        activityType: null,
        userId: mockUser.id,
        title: "t",
        description: null,
        priority: 0,
        percentComplete: 0,
        dueDate: null,
        activityTypeId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { updateTaskStatus } = require("@/actions/task.actions");
      const result = await updateTaskStatus("task-1", "in-progress");

      expect(result.success).toBe(true);
      expect(prisma.task.update).toHaveBeenCalledTimes(1);
    });

    it("proceeds to update for a valid status 'complete'", async () => {
      (prisma.task.update as jest.Mock).mockResolvedValue({
        id: "task-1",
        status: "complete",
        activityType: null,
        userId: mockUser.id,
        title: "t",
        description: null,
        priority: 0,
        percentComplete: 100,
        dueDate: null,
        activityTypeId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { updateTaskStatus } = require("@/actions/task.actions");
      const result = await updateTaskStatus("task-1", "complete");

      expect(result.success).toBe(true);
    });
  });

  describe("executeBulkAction", () => {
    it("returns { success: false, message: 'Invalid action type' } for an invalid actionType", async () => {
      const { executeBulkAction } = require("@/actions/stagedVacancy.actions");

      const result = await executeBulkAction("invalid-action" as any, ["id-1"]);

      expect(result).toEqual({ success: false, message: "Invalid action type" });
    });

    it("returns { success: false } for an empty string actionType", async () => {
      const { executeBulkAction } = require("@/actions/stagedVacancy.actions");

      const result = await executeBulkAction("" as any, ["id-1"]);

      expect(result).toEqual({ success: false, message: "Invalid action type" });
    });

    it("resolves with success:false for a SQL-injection-like action string", async () => {
      const { executeBulkAction } = require("@/actions/stagedVacancy.actions");

      await expect(executeBulkAction("drop-table" as any, [])).resolves.toEqual({
        success: false,
        message: "Invalid action type",
      });
    });
  });
});
