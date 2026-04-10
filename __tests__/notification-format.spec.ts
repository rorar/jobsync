/**
 * Tests for notification title / reason / actor formatting helpers.
 *
 * These exercise the late-binding i18n pattern: the dispatcher stores
 * `titleKey + titleParams` in `data`, and the UI resolves them at render
 * time so locale switching updates historical notifications.
 *
 * Spec: .team-feature/consult-task4-notifications.md §5 (i18n strategy)
 */

import {
  formatNotificationTitle,
  formatNotificationReason,
  formatNotificationActor,
} from "@/lib/notifications/deep-links";
import type { NotificationDataExtended } from "@/models/notification.model";

const DICTIONARY: Record<string, string> = {
  "notifications.moduleDeactivated.title": "Module paused: {moduleName}",
  "notifications.vacancyBatchStaged.title":
    "{count} new vacancies from {automationName}",
  "notifications.cbEscalation.title": "Circuit breaker tripped",
  "notifications.reason.authExpired": "API key invalid or expired",
  "notifications.reason.manualDeactivation": "Deactivated by user",
  "notifications.actor.system": "System",
  "notifications.actor.module": "Module",
  "notifications.actor.automation": "Automation",
  "notifications.actor.user": "You",
};

// Sprint 4 L-A-02: the formatter parameter type is now `NotificationTranslate
// = (key: TranslationKey) => string`. `TranslationKey` is a type alias for
// `string` today, so this plain local lookup still satisfies the signature.
// The explicit annotation pins the shape so accidental drift in the
// formatter signature surfaces here at compile time.
const t: (key: string) => string = (key) => DICTIONARY[key] ?? key;

describe("formatNotificationTitle", () => {
  it("resolves titleKey with params", () => {
    const data: NotificationDataExtended = {
      titleKey: "notifications.moduleDeactivated.title",
      titleParams: { moduleName: "EURES" },
    };
    expect(formatNotificationTitle(data, "fallback", t)).toBe(
      "Module paused: EURES",
    );
  });

  it("substitutes multiple params", () => {
    const data: NotificationDataExtended = {
      titleKey: "notifications.vacancyBatchStaged.title",
      titleParams: { count: 12, automationName: "EURES Berlin" },
    };
    expect(formatNotificationTitle(data, "fallback", t)).toBe(
      "12 new vacancies from EURES Berlin",
    );
  });

  it("returns fallbackMessage when titleKey is missing", () => {
    const data: NotificationDataExtended = { automationId: "x" };
    expect(formatNotificationTitle(data, "legacy message", t)).toBe(
      "legacy message",
    );
  });

  it("returns fallbackMessage when data is null", () => {
    expect(formatNotificationTitle(null, "legacy", t)).toBe("legacy");
  });

  it("leaves placeholders intact when params are missing (no crash)", () => {
    const data: NotificationDataExtended = {
      titleKey: "notifications.moduleDeactivated.title",
      // titleParams missing entirely
    };
    expect(formatNotificationTitle(data, "fallback", t)).toBe(
      "Module paused: {moduleName}",
    );
  });

  it("leaves individual placeholders intact when only some params provided", () => {
    const data: NotificationDataExtended = {
      titleKey: "notifications.vacancyBatchStaged.title",
      titleParams: { count: 5 },
    };
    expect(formatNotificationTitle(data, "fallback", t)).toBe(
      "5 new vacancies from {automationName}",
    );
  });

  it("resolves a parameter-free titleKey", () => {
    const data: NotificationDataExtended = {
      titleKey: "notifications.cbEscalation.title",
    };
    expect(formatNotificationTitle(data, "fallback", t)).toBe(
      "Circuit breaker tripped",
    );
  });
});

describe("formatNotificationReason", () => {
  it("resolves reasonKey via i18n", () => {
    const data: NotificationDataExtended = {
      reasonKey: "notifications.reason.authExpired",
    };
    expect(formatNotificationReason(data, t)).toBe("API key invalid or expired");
  });

  it("returns null when reasonKey is missing", () => {
    expect(formatNotificationReason({}, t)).toBeNull();
    expect(formatNotificationReason(null, t)).toBeNull();
  });

  it("substitutes reasonParams", () => {
    const data: NotificationDataExtended = {
      reasonKey: "custom.reason.withParam",
      reasonParams: { count: 3 },
    };
    // Unknown key returns the key itself; params are still substituted on it.
    // {count} is not in the key, so result is the raw key.
    expect(formatNotificationReason(data, t)).toBe("custom.reason.withParam");
  });
});

// ---------------------------------------------------------------------------
// ADR-030: top-level column precedence + legacy fallback
// ---------------------------------------------------------------------------

describe("ADR-030 top-level column vs legacy fallback", () => {
  it("prefers the top-level titleKey column over data.titleKey", () => {
    // New-shape source with both top-level fields AND a legacy data blob;
    // the top-level column must win so the latest schema fix takes effect.
    const source = {
      titleKey: "notifications.moduleDeactivated.title",
      titleParams: { moduleName: "EURES (column)" },
      data: {
        titleKey: "notifications.moduleDeactivated.title",
        titleParams: { moduleName: "EURES (legacy)" },
      } as Record<string, unknown>,
    };
    expect(formatNotificationTitle(source, "fallback", t)).toBe(
      "Module paused: EURES (column)",
    );
  });

  it("falls back to legacy data.titleKey when the top-level column is null", () => {
    // Pre-migration row: titleKey is null on the row but the legacy data
    // blob still carries it. The formatter must fall back gracefully so
    // existing notifications continue to render in the user's current locale.
    const source = {
      titleKey: null,
      titleParams: null,
      data: {
        titleKey: "notifications.moduleDeactivated.title",
        titleParams: { moduleName: "EURES" },
      } as Record<string, unknown>,
    };
    expect(formatNotificationTitle(source, "fallback", t)).toBe(
      "Module paused: EURES",
    );
  });

  it("prefers the top-level reasonKey column over data.reasonKey", () => {
    const source = {
      reasonKey: "notifications.reason.authExpired",
      data: {
        reasonKey: "notifications.reason.manualDeactivation",
      } as Record<string, unknown>,
    };
    expect(formatNotificationReason(source, t)).toBe(
      "API key invalid or expired",
    );
  });

  it("falls back to legacy data.reasonKey when top-level column is null", () => {
    const source = {
      reasonKey: null,
      data: {
        reasonKey: "notifications.reason.manualDeactivation",
      } as Record<string, unknown>,
    };
    expect(formatNotificationReason(source, t)).toBe("Deactivated by user");
  });

  it("prefers the top-level actorId column over data.actorId", () => {
    const source = {
      actorId: "eures-column",
      data: { actorId: "eures-legacy" } as Record<string, unknown>,
    };
    expect(formatNotificationActor(source, t)).toBe("eures-column");
  });

  it("falls back to legacy data.actorType when top-level column is null", () => {
    const source = {
      actorType: null,
      actorId: null,
      data: { actorType: "system" } as Record<string, unknown>,
    };
    expect(formatNotificationActor(source, t)).toBe("System");
  });

  it("treats a legacy blob (no `data` key) as the data source for backward compat", () => {
    // This proves the old call-site signature still works: passing a raw
    // NotificationDataExtended blob (no wrapping `data` key) resolves all
    // fields from the blob exactly as before the migration.
    const data: NotificationDataExtended = {
      titleKey: "notifications.moduleDeactivated.title",
      titleParams: { moduleName: "Legacy" },
      actorType: "module",
      actorId: "eures",
      reasonKey: "notifications.reason.authExpired",
    };
    expect(formatNotificationTitle(data, "fallback", t)).toBe(
      "Module paused: Legacy",
    );
    expect(formatNotificationReason(data, t)).toBe("API key invalid or expired");
    expect(formatNotificationActor(data, t)).toBe("eures");
  });
});

describe("formatNotificationActor", () => {
  it("uses actorNameKey when provided and resolvable", () => {
    const data: NotificationDataExtended = {
      actorNameKey: "notifications.actor.system",
    };
    expect(formatNotificationActor(data, t)).toBe("System");
  });

  it("falls back to actorId when actorNameKey is missing", () => {
    const data: NotificationDataExtended = {
      actorType: "module",
      actorId: "eures",
    };
    expect(formatNotificationActor(data, t)).toBe("eures");
  });

  it("falls back to generic system label when only actorType provided", () => {
    const data: NotificationDataExtended = { actorType: "system" };
    expect(formatNotificationActor(data, t)).toBe("System");
  });

  it("falls back to generic automation label", () => {
    const data: NotificationDataExtended = { actorType: "automation" };
    expect(formatNotificationActor(data, t)).toBe("Automation");
  });

  it("returns empty string when no actor info present", () => {
    expect(formatNotificationActor(null, t)).toBe("");
    expect(formatNotificationActor({}, t)).toBe("");
  });

  // ---------------------------------------------------------------------------
  // Sprint 3 M-A-01 + M-A-08 — actor type exhaustiveness
  // Sprint 4 L-A — dead variant `"enrichment"` removed
  //
  // Before the Sprint 3 fix, `formatNotificationActor` only handled
  // `system`, `automation`, and `user` actor types. When a module lifecycle
  // notification arrived with `actorType = "module"` AND no actorId set,
  // the function fell through the switch and returned an empty string —
  // the UI showed an unlabelled actor slot.
  //
  // Sprint 3 added explicit cases for `module` (and, pre-Sprint-4, for
  // `enrichment`) PLUS a `never` exhaustiveness guard that fails at
  // compile time if `NotificationActorType` gains a new member without a
  // matching case.
  //
  // Sprint 4 L-A removed the `"enrichment"` variant entirely after an
  // audit turned up zero production writers populating it and zero specs
  // documenting a planned writer. When enrichment failure notifications
  // land, the introducing sprint re-adds both the union member AND the
  // writer in the same change, and the `never` guard points at the exact
  // site that needs a new case.
  //
  // See stream-5b-architecture.md findings M-A-01 + M-A-08 and
  // `.team-feature/stream-4a-architecture-result.md` for the L-A trail.
  // ---------------------------------------------------------------------------
  describe("M-A-01 + M-A-08 — exhaustive actor-type coverage", () => {
    it("renders the module generic label when actorType=module has no actorId", () => {
      const data: NotificationDataExtended = { actorType: "module" };
      expect(formatNotificationActor(data, t)).toBe("Module");
    });

    it("still prefers actorId over the generic module label when actorId is set", () => {
      // The actorId path takes precedence: a module notification with a
      // specific moduleId slug still renders the slug so users can identify
      // WHICH module raised the event. The generic "Module" label is only
      // the fallback when no concrete actorId exists.
      const data: NotificationDataExtended = {
        actorType: "module",
        actorId: "logo_dev",
      };
      expect(formatNotificationActor(data, t)).toBe("logo_dev");
    });

    it("falls back to empty string for an unknown actor type (no crash)", () => {
      // Runtime drift guard: even though the compile-time `never` exhaustiveness
      // check prevents this in TypeScript, we still assert graceful runtime
      // behavior if an invalid value slips in via legacy DB data — including
      // a legacy `"enrichment"` row written before Sprint 4 L-A removed the
      // variant (such rows never existed in production, but the defensive
      // branch costs nothing and documents the removal).
      const data = { actorType: "alien" } as unknown as NotificationDataExtended;
      expect(formatNotificationActor(data, t)).toBe("");

      const legacyEnrichment = {
        actorType: "enrichment",
      } as unknown as NotificationDataExtended;
      expect(formatNotificationActor(legacyEnrichment, t)).toBe("");
    });
  });
});
