/**
 * enforced-writer.spec.ts — L-A-07 direct unit tests
 *
 * Sprint 5 Stream B follow-up for Sprint 4 Stream A commit c56c310.
 *
 * `_enforcedWriterInternals.resolvePreferencesForEnforcer` is a
 * security-sensitive helper. It owns the fail-open contract that keeps
 * notification delivery alive when UserSettings is absent or unreachable.
 * This file gives it direct unit coverage:
 *
 *   1. Happy path — returns parsed preferences from a well-formed settings row.
 *   2. Fail-open on missing user — `findUnique` returns null → DEFAULT.
 *   3. Fail-open on DB error — `findUnique` throws → DEFAULT.
 *   4. Fail-open on corrupt JSON — `settings` is unparseable → DEFAULT.
 *   5. Fail-open on preferences field absent — parsed object has no
 *      `notifications` key → DEFAULT.
 *
 * Pattern follows `notification-dispatcher-staged-buffers-hmr.spec.ts` for
 * Prisma singleton mocking (`jest.mock("@/lib/db", ...)` before imports).
 */

// ---------------------------------------------------------------------------
// Mocks — must precede all imports so Jest hoisting works
// ---------------------------------------------------------------------------

jest.mock("server-only", () => ({}));

// Prisma singleton mock — control `userSettings.findUnique` per test
const mockUserSettingsFindUnique = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    userSettings: {
      findUnique: (...args: unknown[]) => mockUserSettingsFindUnique(...args),
    },
  },
}));

// notification.model is a real module — import its actual DEFAULT so we can
// assert the resolver returns the same reference shape.
jest.mock("@/models/notification.model", () => {
  const actual = jest.requireActual<typeof import("@/models/notification.model")>(
    "@/models/notification.model",
  );
  return actual;
});

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import { _enforcedWriterInternals } from "@/lib/notifications/enforced-writer";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/models/notification.model";
import type { NotificationPreferences } from "@/models/notification.model";

const { resolvePreferencesForEnforcer } = _enforcedWriterInternals;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = "user-enforced-writer-test-1";

/** A realistic custom preference object stored as JSON in UserSettings.settings */
const CUSTOM_PREFERENCES: NotificationPreferences = {
  enabled: true,
  channels: { inApp: true, webhook: true, email: false, push: true },
  perType: {
    vacancy_promoted: { enabled: true },
    module_deactivated: { enabled: false },
  },
};

/** A fully-disabled preference (global kill switch) */
const DISABLED_PREFERENCES: NotificationPreferences = {
  enabled: false,
  channels: { inApp: false, webhook: false, email: false, push: false },
  perType: {},
};

/** Builds a fake UserSettings Prisma row whose `settings` JSON encodes the given prefs */
function fakeSettingsRow(notifications: NotificationPreferences) {
  return {
    id: "settings-row-1",
    userId: TEST_USER_ID,
    settings: JSON.stringify({ notifications }),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("_enforcedWriterInternals.resolvePreferencesForEnforcer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Happy path — well-formed settings row
  // =========================================================================

  describe("happy path", () => {
    it("returns the parsed notifications preferences from the settings row", async () => {
      mockUserSettingsFindUnique.mockResolvedValue(fakeSettingsRow(CUSTOM_PREFERENCES));

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(result).toEqual(CUSTOM_PREFERENCES);
    });

    it("queries userSettings by userId", async () => {
      mockUserSettingsFindUnique.mockResolvedValue(fakeSettingsRow(CUSTOM_PREFERENCES));

      await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(mockUserSettingsFindUnique).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
      });
    });

    it("returns fully-disabled preferences when stored preferences disable everything", async () => {
      mockUserSettingsFindUnique.mockResolvedValue(fakeSettingsRow(DISABLED_PREFERENCES));

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(result).toEqual(DISABLED_PREFERENCES);
      expect(result.enabled).toBe(false);
    });

    it("preserves perType overrides from the stored preferences", async () => {
      const prefsWithPerType: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        perType: {
          vacancy_promoted: { enabled: false },
          module_unreachable: { enabled: true },
        },
      };
      mockUserSettingsFindUnique.mockResolvedValue(fakeSettingsRow(prefsWithPerType));

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(result.perType).toEqual(prefsWithPerType.perType);
    });
  });

  // =========================================================================
  // 2. Fail-open — findUnique returns null (user has no settings row)
  // =========================================================================

  describe("fail-open: missing user settings row", () => {
    it("returns DEFAULT_NOTIFICATION_PREFERENCES when findUnique resolves null", async () => {
      mockUserSettingsFindUnique.mockResolvedValue(null);

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it("fail-open result has enabled=true so notifications are NOT silently dropped", async () => {
      mockUserSettingsFindUnique.mockResolvedValue(null);

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      // The fail-open invariant: absence of settings must never suppress notifications.
      expect(result.enabled).toBe(true);
    });

    it("fail-open result has inApp=true (default channel stays on)", async () => {
      mockUserSettingsFindUnique.mockResolvedValue(null);

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(result.channels.inApp).toBe(true);
    });
  });

  // =========================================================================
  // 3. Fail-open — DB throws (network error, lock contention, etc.)
  // =========================================================================

  describe("fail-open: DB error", () => {
    it("returns DEFAULT_NOTIFICATION_PREFERENCES when findUnique throws", async () => {
      mockUserSettingsFindUnique.mockRejectedValue(
        new Error("SQLITE_BUSY: database is locked"),
      );

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it("does not re-throw when findUnique throws", async () => {
      mockUserSettingsFindUnique.mockRejectedValue(new Error("Connection refused"));

      await expect(resolvePreferencesForEnforcer(TEST_USER_ID)).resolves.toBeDefined();
    });

    it("fail-open on DB error keeps enabled=true (security invariant: delivery over suppression)", async () => {
      mockUserSettingsFindUnique.mockRejectedValue(new Error("Prisma engine crashed"));

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(result.enabled).toBe(true);
    });

    it("only calls findUnique once per invocation even when it throws", async () => {
      mockUserSettingsFindUnique.mockRejectedValue(new Error("timeout"));

      await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(mockUserSettingsFindUnique).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 4. Fail-open — corrupt / unparseable JSON in settings column
  // =========================================================================

  describe("fail-open: corrupt JSON in settings row", () => {
    it("returns DEFAULT_NOTIFICATION_PREFERENCES when settings contains invalid JSON", async () => {
      mockUserSettingsFindUnique.mockResolvedValue({
        id: "settings-row-corrupt",
        userId: TEST_USER_ID,
        settings: "{ this is not valid JSON !!!",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it("returns DEFAULT_NOTIFICATION_PREFERENCES when settings is an empty string", async () => {
      mockUserSettingsFindUnique.mockResolvedValue({
        id: "settings-row-empty",
        userId: TEST_USER_ID,
        settings: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });
  });

  // =========================================================================
  // 5. Fail-open — settings JSON parsed OK but has no `notifications` key
  // =========================================================================

  describe("fail-open: parsed settings object has no notifications key", () => {
    it("returns DEFAULT_NOTIFICATION_PREFERENCES when notifications field is absent", async () => {
      mockUserSettingsFindUnique.mockResolvedValue({
        id: "settings-row-no-notif",
        userId: TEST_USER_ID,
        // Valid JSON but no notifications key — e.g. a row from an older schema
        settings: JSON.stringify({ theme: "dark", language: "de" }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it("returns DEFAULT_NOTIFICATION_PREFERENCES when notifications field is explicitly null", async () => {
      mockUserSettingsFindUnique.mockResolvedValue({
        id: "settings-row-null-notif",
        userId: TEST_USER_ID,
        settings: JSON.stringify({ notifications: null }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await resolvePreferencesForEnforcer(TEST_USER_ID);

      // null is falsy — the ?? DEFAULT_NOTIFICATION_PREFERENCES branch fires
      expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });
  });
});
