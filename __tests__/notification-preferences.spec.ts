/**
 * Notification Preferences — Unit Tests
 *
 * Tests for:
 * - shouldNotify() logic (global, per-type, channel, quiet hours)
 * - DEFAULT_NOTIFICATION_PREFERENCES shape
 * - CONFIGURABLE_NOTIFICATION_TYPES completeness
 */

import {
  shouldNotify,
  DEFAULT_NOTIFICATION_PREFERENCES,
  CONFIGURABLE_NOTIFICATION_TYPES,
  type NotificationPreferences,
  type NotificationType,
} from "@/models/notification.model";

describe("DEFAULT_NOTIFICATION_PREFERENCES", () => {
  it("has enabled=true by default", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.enabled).toBe(true);
  });

  it("has inApp channel enabled", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.channels.inApp).toBe(true);
  });

  it("has no per-type overrides", () => {
    expect(Object.keys(DEFAULT_NOTIFICATION_PREFERENCES.perType)).toHaveLength(0);
  });

  it("has no quiet hours configured", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.quietHours).toBeUndefined();
  });
});

describe("CONFIGURABLE_NOTIFICATION_TYPES", () => {
  it("includes key notification types", () => {
    expect(CONFIGURABLE_NOTIFICATION_TYPES).toContain("auth_failure");
    expect(CONFIGURABLE_NOTIFICATION_TYPES).toContain("consecutive_failures");
    expect(CONFIGURABLE_NOTIFICATION_TYPES).toContain("cb_escalation");
    expect(CONFIGURABLE_NOTIFICATION_TYPES).toContain("module_deactivated");
    expect(CONFIGURABLE_NOTIFICATION_TYPES).toContain("vacancy_promoted");
    expect(CONFIGURABLE_NOTIFICATION_TYPES).toContain("bulk_action_completed");
    expect(CONFIGURABLE_NOTIFICATION_TYPES).toContain("retention_completed");
  });

  it("contains at least 7 entries", () => {
    expect(CONFIGURABLE_NOTIFICATION_TYPES.length).toBeGreaterThanOrEqual(7);
  });
});

describe("shouldNotify()", () => {
  const basePrefs: NotificationPreferences = {
    enabled: true,
    channels: { inApp: true },
    perType: {},
  };

  describe("global kill switch", () => {
    it("returns true when globally enabled with defaults", () => {
      expect(shouldNotify(basePrefs, "vacancy_promoted")).toBe(true);
    });

    it("returns false when globally disabled", () => {
      expect(
        shouldNotify({ ...basePrefs, enabled: false }, "vacancy_promoted"),
      ).toBe(false);
    });
  });

  describe("channel gating", () => {
    it("returns false when inApp channel is disabled", () => {
      const prefs: NotificationPreferences = {
        ...basePrefs,
        channels: { inApp: false },
      };
      expect(shouldNotify(prefs, "vacancy_promoted")).toBe(false);
    });
  });

  describe("per-type overrides", () => {
    it("returns false when specific type is explicitly disabled", () => {
      const prefs: NotificationPreferences = {
        ...basePrefs,
        perType: { vacancy_promoted: { enabled: false } },
      };
      expect(shouldNotify(prefs, "vacancy_promoted")).toBe(false);
    });

    it("returns true when specific type is explicitly enabled", () => {
      const prefs: NotificationPreferences = {
        ...basePrefs,
        perType: { vacancy_promoted: { enabled: true } },
      };
      expect(shouldNotify(prefs, "vacancy_promoted")).toBe(true);
    });

    it("returns true when type has no explicit override (default=enabled)", () => {
      expect(shouldNotify(basePrefs, "auth_failure")).toBe(true);
    });

    it("does not affect other types when one is disabled", () => {
      const prefs: NotificationPreferences = {
        ...basePrefs,
        perType: { vacancy_promoted: { enabled: false } },
      };
      expect(shouldNotify(prefs, "auth_failure")).toBe(true);
      expect(shouldNotify(prefs, "vacancy_promoted")).toBe(false);
    });
  });

  describe("quiet hours", () => {
    // Use a fixed date: 2026-03-29T23:30:00Z (UTC)
    // In Europe/Berlin (UTC+2 in summer), this is 2026-03-30 01:30
    // In UTC, this is 23:30

    it("returns false during quiet hours (same timezone)", () => {
      const prefs: NotificationPreferences = {
        ...basePrefs,
        quietHours: {
          enabled: true,
          start: "23:00",
          end: "07:00",
          timezone: "UTC",
        },
      };
      // 23:30 UTC is within 23:00-07:00 (overnight)
      const now = new Date("2026-03-29T23:30:00Z");
      expect(shouldNotify(prefs, "vacancy_promoted", now)).toBe(false);
    });

    it("returns true outside quiet hours", () => {
      const prefs: NotificationPreferences = {
        ...basePrefs,
        quietHours: {
          enabled: true,
          start: "22:00",
          end: "07:00",
          timezone: "UTC",
        },
      };
      // 12:00 UTC is outside 22:00-07:00
      const now = new Date("2026-03-29T12:00:00Z");
      expect(shouldNotify(prefs, "vacancy_promoted", now)).toBe(true);
    });

    it("returns true when quiet hours are disabled", () => {
      const prefs: NotificationPreferences = {
        ...basePrefs,
        quietHours: {
          enabled: false,
          start: "22:00",
          end: "07:00",
          timezone: "UTC",
        },
      };
      const now = new Date("2026-03-29T23:30:00Z");
      expect(shouldNotify(prefs, "vacancy_promoted", now)).toBe(true);
    });

    it("handles same-day ranges correctly", () => {
      const prefs: NotificationPreferences = {
        ...basePrefs,
        quietHours: {
          enabled: true,
          start: "09:00",
          end: "17:00",
          timezone: "UTC",
        },
      };
      // 12:00 UTC is within 09:00-17:00
      const midday = new Date("2026-03-29T12:00:00Z");
      expect(shouldNotify(prefs, "vacancy_promoted", midday)).toBe(false);

      // 20:00 UTC is outside 09:00-17:00
      const evening = new Date("2026-03-29T20:00:00Z");
      expect(shouldNotify(prefs, "vacancy_promoted", evening)).toBe(true);
    });

    it("gracefully handles invalid timezone (does not suppress)", () => {
      const prefs: NotificationPreferences = {
        ...basePrefs,
        quietHours: {
          enabled: true,
          start: "22:00",
          end: "07:00",
          timezone: "Invalid/Timezone",
        },
      };
      const now = new Date("2026-03-29T23:30:00Z");
      // Should NOT suppress because the timezone is invalid
      expect(shouldNotify(prefs, "vacancy_promoted", now)).toBe(true);
    });
  });

  describe("combined checks", () => {
    it("global disabled takes precedence over everything", () => {
      const prefs: NotificationPreferences = {
        enabled: false,
        channels: { inApp: true },
        perType: { vacancy_promoted: { enabled: true } },
      };
      expect(shouldNotify(prefs, "vacancy_promoted")).toBe(false);
    });

    it("channel disabled takes precedence over per-type enabled", () => {
      const prefs: NotificationPreferences = {
        enabled: true,
        channels: { inApp: false },
        perType: { vacancy_promoted: { enabled: true } },
      };
      expect(shouldNotify(prefs, "vacancy_promoted")).toBe(false);
    });
  });
});
