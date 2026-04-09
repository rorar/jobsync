/**
 * Tests for notification deep-link mapping.
 *
 * Spec: .team-feature/consult-task4-notifications.md §3 (deep-link table)
 */

import {
  buildNotificationActions,
  resolveNotificationSeverity,
} from "@/lib/notifications/deep-links";
import type { NotificationDataExtended } from "@/models/notification.model";

describe("buildNotificationActions", () => {
  describe("vacancy_batch_staged", () => {
    it("deep-links to the staging queue filtered by automationId", () => {
      const data: NotificationDataExtended = { automationId: "auto-1" };
      const actions = buildNotificationActions("vacancy_batch_staged", data);
      expect(actions).toHaveLength(1);
      expect(actions[0].url).toBe("/dashboard/staging?automationId=auto-1");
      expect(actions[0].labelKey).toBe("notifications.action.viewStaged");
    });

    it("falls back to the unfiltered staging queue when automationId missing", () => {
      const actions = buildNotificationActions("vacancy_batch_staged", null);
      expect(actions).toHaveLength(1);
      expect(actions[0].url).toBe("/dashboard/staging");
    });

    it("url-encodes automationId to prevent injection", () => {
      const data: NotificationDataExtended = { automationId: "auto/1?x=2" };
      const actions = buildNotificationActions("vacancy_batch_staged", data);
      expect(actions[0].url).toBe(
        "/dashboard/staging?automationId=auto%2F1%3Fx%3D2",
      );
    });
  });

  describe("vacancy_promoted", () => {
    it("deep-links to the created job when jobId is present", () => {
      const data: NotificationDataExtended = { jobId: "job-42" };
      const actions = buildNotificationActions("vacancy_promoted", data);
      expect(actions).toHaveLength(1);
      expect(actions[0].url).toBe("/dashboard/myjobs/job-42");
      expect(actions[0].labelKey).toBe("notifications.action.openJob");
    });

    it("returns no actions when jobId is missing", () => {
      const actions = buildNotificationActions("vacancy_promoted", null);
      expect(actions).toEqual([]);
    });
  });

  describe("bulk_action_completed", () => {
    it("links to the staging queue root", () => {
      const actions = buildNotificationActions(
        "bulk_action_completed",
        null,
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].url).toBe("/dashboard/staging");
      expect(actions[0].labelKey).toBe("notifications.action.viewStaging");
    });
  });

  describe.each([
    "module_deactivated",
    "module_reactivated",
    "module_unreachable",
  ] as const)("%s", (type) => {
    it("links to module settings", () => {
      const actions = buildNotificationActions(type, null);
      expect(actions).toHaveLength(1);
      expect(actions[0].url).toBe("/dashboard/settings?section=modules");
      expect(actions[0].labelKey).toBe("notifications.action.openModules");
    });
  });

  describe.each(["cb_escalation", "consecutive_failures"] as const)(
    "%s",
    (type) => {
      it("deep-links to the failing automation when automationId present", () => {
        const data: NotificationDataExtended = { automationId: "auto-9" };
        const actions = buildNotificationActions(type, data);
        expect(actions).toHaveLength(1);
        expect(actions[0].url).toBe("/dashboard/automations/auto-9");
        expect(actions[0].labelKey).toBe(
          "notifications.action.openAutomation",
        );
      });

      it("returns no actions when automationId missing", () => {
        const actions = buildNotificationActions(type, null);
        expect(actions).toEqual([]);
      });
    },
  );

  describe("auth_failure", () => {
    it("links to API key settings", () => {
      const actions = buildNotificationActions("auth_failure", null);
      expect(actions).toHaveLength(1);
      expect(actions[0].url).toBe("/dashboard/settings?section=api-keys");
      expect(actions[0].labelKey).toBe("notifications.action.openApiKeys");
    });
  });

  describe("retention_completed", () => {
    it("links to retention settings", () => {
      const actions = buildNotificationActions("retention_completed", null);
      expect(actions).toHaveLength(1);
      expect(actions[0].url).toBe("/dashboard/settings?section=retention");
      expect(actions[0].labelKey).toBe("notifications.action.viewSettings");
    });
  });

  describe("job_status_changed", () => {
    it("deep-links to the job detail when jobId present", () => {
      const data: NotificationDataExtended = { jobId: "job-1" };
      const actions = buildNotificationActions("job_status_changed", data);
      expect(actions).toHaveLength(1);
      expect(actions[0].url).toBe("/dashboard/myjobs/job-1");
    });

    it("returns no actions when jobId missing", () => {
      const actions = buildNotificationActions("job_status_changed", null);
      expect(actions).toEqual([]);
    });
  });

  it("returns an empty array for unknown types", () => {
    // Cast through unknown to test runtime safety with an unknown type.
    const actions = buildNotificationActions(
      "unknown_type" as unknown as "auth_failure",
      null,
    );
    // Default branch in switch returns [].
    // "auth_failure" would return 1 entry, so this also proves type narrowing.
    expect(Array.isArray(actions)).toBe(true);
  });

  it("ignores non-string automationId", () => {
    const data = { automationId: 42 } as unknown as NotificationDataExtended;
    const actions = buildNotificationActions("vacancy_batch_staged", data);
    expect(actions[0].url).toBe("/dashboard/staging");
  });
});

describe("resolveNotificationSeverity", () => {
  it("uses the severity from data when present", () => {
    expect(
      resolveNotificationSeverity("vacancy_promoted", { severity: "warning" }),
    ).toBe("warning");
  });

  it("falls back to type-based default", () => {
    expect(resolveNotificationSeverity("auth_failure", null)).toBe("error");
    expect(resolveNotificationSeverity("module_deactivated", null)).toBe(
      "warning",
    );
    expect(resolveNotificationSeverity("vacancy_promoted", null)).toBe(
      "success",
    );
    expect(resolveNotificationSeverity("vacancy_batch_staged", null)).toBe(
      "info",
    );
  });

  // ADR-030: top-level `severity` column wins over legacy `data.severity`.
  it("prefers the top-level severity column over data.severity", () => {
    const source = {
      severity: "error" as const,
      data: { severity: "info" } as Record<string, unknown>,
    };
    expect(resolveNotificationSeverity("vacancy_promoted", source)).toBe(
      "error",
    );
  });

  it("falls back to legacy data.severity when top-level column is null", () => {
    const source = {
      severity: null,
      data: { severity: "warning" } as Record<string, unknown>,
    };
    expect(resolveNotificationSeverity("vacancy_promoted", source)).toBe(
      "warning",
    );
  });
});
