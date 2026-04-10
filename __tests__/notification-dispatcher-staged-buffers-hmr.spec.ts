/**
 * L-S-02: stagedBuffers globalThis singleton test
 *
 * Verifies that the stagedBuffers Map is attached to globalThis so it
 * survives HMR module reloads. Under HMR the module is re-executed —
 * without the globalThis pattern a fresh Map would be created while
 * existing setTimeout callbacks still close over the old reference.
 *
 * This test simulates the "re-import" scenario by inspecting globalThis
 * directly and confirming the Map reference is identical to what the
 * module exposes through _testHelpers.stagedBuffers.
 */

// ---------------------------------------------------------------------------
// Mocks — must come before imports so Jest hoisting works
// ---------------------------------------------------------------------------

jest.mock("server-only", () => ({}));

jest.mock("@/lib/events/event-bus", () => ({
  eventBus: { subscribe: jest.fn(), publish: jest.fn() },
}));

jest.mock("@/lib/events/event-types", () => ({
  DomainEventType: {
    VacancyPromoted: "VacancyPromoted",
    VacancyStaged: "VacancyStaged",
    BulkActionCompleted: "BulkActionCompleted",
    ModuleDeactivated: "ModuleDeactivated",
    ModuleReactivated: "ModuleReactivated",
    RetentionCompleted: "RetentionCompleted",
    JobStatusChanged: "JobStatusChanged",
  },
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    automation: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

jest.mock("@/lib/notifications/channel-router", () => ({
  channelRouter: { route: jest.fn().mockResolvedValue([]) },
  registerChannels: jest.fn(),
}));

jest.mock("@/i18n/server", () => ({
  t: jest.fn().mockReturnValue(""),
}));

jest.mock("@/i18n/locales", () => ({
  DEFAULT_LOCALE: "en",
  isValidLocale: jest.fn().mockReturnValue(true),
}));

jest.mock("@/models/notification.model", () => ({
  DEFAULT_NOTIFICATION_PREFERENCES: {},
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { _testHelpers } from "@/lib/events/consumers/notification-dispatcher";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("L-S-02: stagedBuffers globalThis singleton", () => {
  beforeEach(() => {
    _testHelpers.stagedBuffers.clear();
  });

  afterEach(() => {
    _testHelpers.stagedBuffers.clear();
  });

  it("stagedBuffers is stored on globalThis.__notifStagedBuffers", () => {
    const g = globalThis as unknown as {
      __notifStagedBuffers?: Map<string, unknown>;
    };

    // The globalThis key must exist after module import
    expect(g.__notifStagedBuffers).toBeDefined();
    expect(g.__notifStagedBuffers).toBeInstanceOf(Map);
  });

  it("_testHelpers.stagedBuffers is the SAME reference as globalThis.__notifStagedBuffers", () => {
    const g = globalThis as unknown as {
      __notifStagedBuffers?: Map<string, unknown>;
    };

    // Same object identity — module reload would NOT break this link
    expect(_testHelpers.stagedBuffers).toBe(g.__notifStagedBuffers);
  });

  it("mutations via _testHelpers are visible via globalThis and vice-versa", () => {
    const g = globalThis as unknown as {
      __notifStagedBuffers?: Map<string, unknown>;
    };

    // Write through _testHelpers
    _testHelpers.stagedBuffers.set("auto-x", {
      userId: "u1",
      count: 1,
      timer: setTimeout(() => {}, 99999),
    });

    // Read via globalThis — same entry must be present
    expect(g.__notifStagedBuffers?.has("auto-x")).toBe(true);

    // Write via globalThis, read via _testHelpers
    g.__notifStagedBuffers?.set("auto-y", {
      userId: "u2",
      count: 2,
      timer: setTimeout(() => {}, 99999),
    });
    expect(_testHelpers.stagedBuffers.has("auto-y")).toBe(true);
  });

  it("FLUSH_DELAY_MS is exported and equals 5000ms", () => {
    expect(_testHelpers.FLUSH_DELAY_MS).toBe(5_000);
  });
});
