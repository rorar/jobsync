/**
 * IF-7 — `NotificationType` single-source-of-truth guards.
 *
 * The strong drift protection is COMPILE-TIME and lives in the source:
 *  - `NOTIFICATION_TYPE_CONFIGURABILITY` is `Record<NotificationType, boolean>`,
 *    so adding a union member without listing it is a build error (the derived
 *    `CONFIGURABLE_NOTIFICATION_TYPES` can never silently drift from the union).
 *  - `buildNotificationActions` has a `never` exhaustiveness guard in `default`.
 *
 * These runtime checks document the invariant and catch ordering/duplication
 * regressions that the type system does not.
 */
import {
  CONFIGURABLE_NOTIFICATION_TYPES,
  type NotificationType,
} from "@/models/notification.model";

describe("NotificationType single source of truth (IF-7)", () => {
  it("CONFIGURABLE_NOTIFICATION_TYPES has no duplicates", () => {
    const unique = new Set(CONFIGURABLE_NOTIFICATION_TYPES);
    expect(unique.size).toBe(CONFIGURABLE_NOTIFICATION_TYPES.length);
  });

  it("is non-empty and contains only non-empty string members", () => {
    expect(CONFIGURABLE_NOTIFICATION_TYPES.length).toBeGreaterThan(0);
    for (const t of CONFIGURABLE_NOTIFICATION_TYPES) {
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it("covers the known core notification types (drift canary)", () => {
    // A representative sample from each domain group. If a rename drops one of
    // these from the configurable set, this canary fires.
    const expected: NotificationType[] = [
      "auth_failure",
      "vacancy_promoted",
      "job_status_changed",
      "interview_reminder",
      "retention_expired",
    ];
    for (const t of expected) {
      expect(CONFIGURABLE_NOTIFICATION_TYPES).toContain(t);
    }
  });

  it("type-level: a literal is assignable to/from the union", () => {
    const t: NotificationType = "vacancy_promoted";
    const back: string = t;
    expect(back).toBe("vacancy_promoted");
  });
});
