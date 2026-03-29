/**
 * NotificationDispatcher Tests
 *
 * Tests: event-to-notification mapping for VacancyPromoted, BulkActionCompleted,
 * RetentionCompleted, ModuleDeactivated, ModuleReactivated, VacancyStaged batching
 * Spec: specs/notification-dispatch.allium
 */

import { eventBus } from "@/lib/events/event-bus";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import {
  registerNotificationDispatcher,
  _testHelpers,
} from "@/lib/events/consumers/notification-dispatcher";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    notification: {
      create: jest.fn().mockResolvedValue({ id: "notif-1" }),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      createMany: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

describe("NotificationDispatcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    eventBus.reset();
    _testHelpers.stagedBuffers.clear();
    registerNotificationDispatcher();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("VacancyPromoted", () => {
    it("creates a vacancy_promoted notification", async () => {
      const event = createEvent(DomainEventType.VacancyPromoted, {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      });

      await eventBus.publish(event);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          type: "vacancy_promoted",
          message: "Job created from staged vacancy",
        },
      });
    });
  });

  describe("BulkActionCompleted", () => {
    it("creates a bulk_action_completed notification", async () => {
      const event = createEvent(DomainEventType.BulkActionCompleted, {
        actionType: "dismiss",
        itemIds: ["sv-1", "sv-2", "sv-3"],
        userId: "user-1",
        succeeded: 3,
        failed: 0,
      });

      await eventBus.publish(event);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          type: "bulk_action_completed",
          message: "3 items dismissd successfully",
        },
      });
    });
  });

  describe("RetentionCompleted", () => {
    it("creates a retention_completed notification", async () => {
      const event = createEvent(DomainEventType.RetentionCompleted, {
        userId: "user-1",
        purgedCount: 42,
        hashesCreated: 42,
      });

      await eventBus.publish(event);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          type: "retention_completed",
          message: "42 expired vacancies cleaned up",
        },
      });
    });
  });

  describe("ModuleDeactivated", () => {
    it("creates a module_deactivated notification", async () => {
      const event = createEvent(DomainEventType.ModuleDeactivated, {
        moduleId: "eures",
        userId: "user-1",
        affectedAutomationIds: ["auto-1", "auto-2"],
      });

      await eventBus.publish(event);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          type: "module_deactivated",
          message: "Module eures deactivated. 2 automation(s) paused.",
          moduleId: "eures",
        },
      });
    });
  });

  describe("ModuleReactivated", () => {
    it("creates a module_reactivated notification", async () => {
      const event = createEvent(DomainEventType.ModuleReactivated, {
        moduleId: "eures",
        userId: "user-1",
        pausedAutomationCount: 1,
      });

      await eventBus.publish(event);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          type: "module_reactivated",
          message: "Module eures reactivated. 1 automation(s) remain paused.",
          moduleId: "eures",
        },
      });
    });
  });

  describe("VacancyStaged batching", () => {
    it("does not create individual notifications for automated staging", async () => {
      const event = createEvent(DomainEventType.VacancyStaged, {
        stagedVacancyId: "sv-1",
        userId: "user-1",
        sourceBoard: "eures",
        automationId: "auto-1",
      });

      await eventBus.publish(event);

      // No immediate notification — buffered
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it("creates batch summary via direct flush", async () => {
      // Stage 3 vacancies from same automation
      for (let i = 0; i < 3; i++) {
        await eventBus.publish(
          createEvent(DomainEventType.VacancyStaged, {
            stagedVacancyId: `sv-${i}`,
            userId: "user-1",
            sourceBoard: "eures",
            automationId: "auto-1",
          }),
        );
      }

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(_testHelpers.stagedBuffers.size).toBe(1);
      expect(_testHelpers.stagedBuffers.get("auto-1")?.count).toBe(3);

      // Directly invoke the flush (simulating what the timer would do)
      await _testHelpers.flushStagedBuffer("auto-1");

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          type: "vacancy_batch_staged",
          message: "3 new vacancies staged from automation",
          automationId: "auto-1",
        },
      });

      // Buffer should be cleared after flush
      expect(_testHelpers.stagedBuffers.has("auto-1")).toBe(false);
    });

    it("ignores manual staging (no automationId)", async () => {
      const event = createEvent(DomainEventType.VacancyStaged, {
        stagedVacancyId: "sv-1",
        userId: "user-1",
        sourceBoard: "manual",
        automationId: null,
      });

      await eventBus.publish(event);

      // No buffer entry created
      expect(_testHelpers.stagedBuffers.size).toBe(0);
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe("Future-ready: preferences", () => {
    it("dispatcher does not crash when notification creation fails", async () => {
      (prisma.notification.create as jest.Mock).mockRejectedValueOnce(
        new Error("DB error"),
      );

      const event = createEvent(DomainEventType.VacancyPromoted, {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      });

      // Should not throw
      await expect(eventBus.publish(event)).resolves.toBeUndefined();
    });
  });
});
