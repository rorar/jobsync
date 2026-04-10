/**
 * Sprint 5 Stream D — closes Sprint 1.5 CRIT-S-04 deferred item.
 *
 * Verifies the Hexagonal port/adapter behaviour of `writeAdminAuditLog`:
 *
 *   - Primary adapter — `prisma.adminAuditLog.create` — receives a row that
 *     mirrors the structured stderr JSON line. Field-by-field equivalence is
 *     asserted because the row schema is the durable contract for the admin
 *     review UI and retention sweeps.
 *
 *   - Always-available port — `[admin-audit]` line on stderr — is emitted on
 *     EVERY call, even when the DB adapter throws. This is the source of
 *     truth: the audit trail must never be silently lost.
 *
 *   - Fire-and-forget semantics — the function returns synchronously even
 *     when Prisma's `.create()` is still pending. The caller (typically a
 *     server action) must NOT block on a DB round-trip for the audit write.
 *
 *   - DB-write failure observability — when Prisma throws, the failure is
 *     logged with the `[admin-audit-db-write-failed]` prefix so an operator
 *     can notice schema drift / migration gaps.
 *
 * Mocking strategy — mirrors `module.actions.spec.ts`:
 *   - `@/lib/db` is mocked so we never touch a real DB.
 *   - `console.warn` is spied so we can capture the legacy `[admin-audit]`
 *     line without polluting the test runner's own stderr. The function
 *     deliberately uses `console.warn` (not `process.stderr.write`) for
 *     log-shipper compatibility with the Sprint 1.5 hotfix configuration.
 *   - `console.error` is spied to capture the `[admin-audit-db-write-failed]`
 *     observability signal emitted when the primary (DB) adapter throws.
 */

// ---------------------------------------------------------------------------
// Mocks — must come before imports so Jest hoisting works.
// ---------------------------------------------------------------------------

jest.mock("server-only", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    adminAuditLog: {
      create: jest.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { writeAdminAuditLog } from "@/lib/auth/admin";
import prisma from "@/lib/db";
import type {
  AdminAuditContext,
  AdminAuthorizationResult,
} from "@/lib/auth/admin";
import type { CurrentUser } from "@/models/user.model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockUser: CurrentUser = {
  id: "user-42",
  name: "Audit Admin",
  email: "admin@example.com",
};

const mockContext: AdminAuditContext = {
  action: "deactivateModule",
  targetId: "eures",
  extra: { previousState: "active", trigger: "manual" },
};

const mockAllowedResult: AdminAuthorizationResult = {
  allowed: true,
  tier: "single_user_implicit",
};

const mockDeniedResult: AdminAuthorizationResult = {
  allowed: false,
  tier: "denied",
  reason: "errors.notAuthorized",
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("writeAdminAuditLog — Hexagonal port/adapter (Sprint 5 Stream D)", () => {
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: DB write succeeds and returns immediately.
    (prisma.adminAuditLog.create as jest.Mock).mockResolvedValue({
      id: "audit-1",
    });
    // Spy on the always-available port. The legacy `[admin-audit]` line is
    // emitted via `console.warn` (not `process.stderr.write` directly) for
    // backwards compatibility with the Sprint 1.5 log-shipper config.
    // `console.error` captures the `[admin-audit-db-write-failed]` signal
    // emitted when the primary adapter (Prisma) throws.
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Happy path — primary adapter + always-available port both fire
  // -------------------------------------------------------------------------

  describe("happy path (DB available)", () => {
    it("persists the row via prisma.adminAuditLog.create", () => {
      writeAdminAuditLog(mockUser, mockContext, mockAllowedResult);

      expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
      const arg = (prisma.adminAuditLog.create as jest.Mock).mock.calls[0][0];
      expect(arg).toEqual({
        data: {
          // `timestamp` is a Date — match the type, not a literal value
          timestamp: expect.any(Date),
          action: "deactivateModule",
          targetId: "eures",
          actorId: "user-42",
          actorEmail: "admin@example.com",
          allowed: true,
          tier: "single_user_implicit",
          reason: null,
          // `extra` is a JSON-serialised string (SQLite has no jsonb).
          extra: JSON.stringify({
            previousState: "active",
            trigger: "manual",
          }),
        },
      });
    });

    it("emits the [admin-audit] line on the always-available port", () => {
      writeAdminAuditLog(mockUser, mockContext, mockAllowedResult);

      // The legacy line is emitted via console.warn (not stderr.write
      // directly), per the function's documented log-shipper compatibility.
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const [prefix, payload] = consoleWarnSpy.mock.calls[0];
      expect(prefix).toBe("[admin-audit]");
      const parsed = JSON.parse(payload as string);
      expect(parsed).toMatchObject({
        kind: "admin_audit",
        action: "deactivateModule",
        targetId: "eures",
        actorId: "user-42",
        actorEmail: "admin@example.com",
        allowed: true,
        tier: "single_user_implicit",
        reason: null,
        // The `extra` fields are spread directly into the JSON line (NOT
        // serialised) so log shippers can filter on them.
        previousState: "active",
        trigger: "manual",
      });
      expect(typeof parsed.ts).toBe("string");
      expect(new Date(parsed.ts).toString()).not.toBe("Invalid Date");
    });

    it("writes a 'denied' entry when the authorization result is denied", () => {
      writeAdminAuditLog(mockUser, mockContext, mockDeniedResult);

      const arg = (prisma.adminAuditLog.create as jest.Mock).mock.calls[0][0];
      expect(arg.data.allowed).toBe(false);
      expect(arg.data.tier).toBe("denied");
      expect(arg.data.reason).toBe("errors.notAuthorized");

      // Stderr line agrees.
      const [, payload] = consoleWarnSpy.mock.calls[0];
      const parsed = JSON.parse(payload as string);
      expect(parsed.allowed).toBe(false);
      expect(parsed.reason).toBe("errors.notAuthorized");
    });

    it("encodes a null `extra` column when context.extra is empty/missing", () => {
      writeAdminAuditLog(
        mockUser,
        { action: "activateModule" }, // no extra
        mockAllowedResult,
      );

      const arg = (prisma.adminAuditLog.create as jest.Mock).mock.calls[0][0];
      expect(arg.data.extra).toBeNull();
      expect(arg.data.targetId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // DB failure — fallback path
  // -------------------------------------------------------------------------

  describe("fallback path (DB write fails)", () => {
    it("STILL emits the [admin-audit] line when Prisma throws", async () => {
      const dbError = new Error("ECONNREFUSED — database unreachable");
      (prisma.adminAuditLog.create as jest.Mock).mockRejectedValue(dbError);

      writeAdminAuditLog(mockUser, mockContext, mockAllowedResult);

      // Always-available port still fires synchronously.
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy.mock.calls[0][0]).toBe("[admin-audit]");

      // Allow the rejected Promise's `.catch` handler to drain.
      // NOTE: `setImmediate` is a Node-only API and is not defined in the
      // jsdom test environment Jest uses for this project. `setTimeout(..., 0)`
      // schedules a macrotask tick that's sufficient for the microtask
      // queue (including the `.catch` handler on the rejected Promise) to
      // flush before the next assertion.
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The DB-write failure is observable via [admin-audit-db-write-failed]
      // — the operator-visible signal that the adapter is degraded.
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[admin-audit-db-write-failed]",
        dbError,
      );
    });

    it("does NOT throw when Prisma synchronously throws inside .create", async () => {
      // Some Prisma error paths throw synchronously before returning a
      // Promise. The fire-and-forget chain must not bubble up.
      (prisma.adminAuditLog.create as jest.Mock).mockImplementation(() => {
        throw new Error("synchronous Prisma init error");
      });

      // The function must return cleanly (no thrown error).
      expect(() =>
        writeAdminAuditLog(mockUser, mockContext, mockAllowedResult),
      ).not.toThrow();

      // The fallback line still gets through.
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[admin-audit]",
        expect.any(String),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Fire-and-forget semantics
  // -------------------------------------------------------------------------

  describe("fire-and-forget semantics", () => {
    it("returns synchronously while the DB write is still pending", () => {
      // A never-resolving promise simulates a hung DB connection.
      let releasePending!: () => void;
      const pending = new Promise<void>((resolve) => {
        releasePending = resolve;
      });
      (prisma.adminAuditLog.create as jest.Mock).mockReturnValue(pending);

      const start = Date.now();
      const result = writeAdminAuditLog(
        mockUser,
        mockContext,
        mockAllowedResult,
      );
      const elapsed = Date.now() - start;

      // The function is `void` and must NOT block on the DB write.
      expect(result).toBeUndefined();
      // Generous bound — even on a slow CI box, a synchronous return must
      // not take more than a few ms. The DB write is still pending.
      expect(elapsed).toBeLessThan(50);
      // Stderr line is already on its way out the door.
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

      // Cleanup the pending promise so Jest does not warn about an open
      // handle.
      releasePending();
    });
  });

  // -------------------------------------------------------------------------
  // Anonymous attempts (user === null)
  // -------------------------------------------------------------------------

  describe("anonymous attempts", () => {
    it("skips the DB adapter when user is null but still emits stderr", () => {
      writeAdminAuditLog(null, mockContext, mockDeniedResult);

      // Cannot persist a NOT NULL actorId — the DB write is skipped on
      // purpose. The stderr line is still emitted with actorId: null so
      // forensics can see the anonymous attempt.
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleWarnSpy.mock.calls[0][1] as string);
      expect(parsed.actorId).toBeNull();
      expect(parsed.actorEmail).toBeNull();
      expect(parsed.allowed).toBe(false);
    });
  });

});
