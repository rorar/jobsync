import {
  createCrmTask,
  startCrmTask,
  completeCrmTask,
  cancelCrmTask,
  deleteCrmTask,
  getCrmTasks,
} from "@/actions/crmTask.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";

jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    crmTask: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    crmActivityLog: { create: jest.fn() },
    person: { findFirst: jest.fn() },
    company: { findFirst: jest.fn() },
    job: { findFirst: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/events", () => ({ eventBus: { publish: jest.fn() } }));
jest.mock("@/lib/events/event-types", () => ({
  createEvent: jest.fn((_type: string, payload: unknown) => ({ type: _type, payload })),
  DomainEventType: {
    CrmTaskCreated: "CrmTaskCreated",
    CrmTaskCompleted: "CrmTaskCompleted",
  },
}));

// Also mock server-only and the db singleton so the module loads in Jest
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db", () => {
  const { PrismaClient } = jest.requireMock("@prisma/client");
  return new PrismaClient();
});
jest.mock("@/models/person.model", () => ({
  isValidTaskTransition: jest.fn(),
  validateExactlyOneTarget: jest.fn(),
  CRM_CONFIG: { maxTasksPerUser: 5000 },
}));

import { isValidTaskTransition, validateExactlyOneTarget } from "@/models/person.model";

const prisma = new PrismaClient();

const mockUser = { id: "user-id", name: "Test User", email: "test@example.com" };

describe("crmTask.actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // createCrmTask
  // ---------------------------------------------------------------------------

  describe("createCrmTask", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await createCrmTask({
        title: "My Task",
        targets: [{ targetPersonId: "person-1" }],
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("rejects empty targets array", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      const result = await createCrmTask({ title: "Task", targets: [] });

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.targetRequired");
    });

    it("rejects invalid polymorphic target (two fields set)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (validateExactlyOneTarget as jest.Mock).mockReturnValue(false);

      const result = await createCrmTask({
        title: "Task",
        targets: [{ targetPersonId: "p-1", targetJobId: "j-1" }],
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.exactlyOneTarget");
    });

    it("rejects when task limit (5000) reached", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (validateExactlyOneTarget as jest.Mock).mockReturnValue(true);
      (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "p-1" });
      (prisma.crmTask.count as jest.Mock).mockResolvedValue(5000);

      const result = await createCrmTask({
        title: "Task",
        targets: [{ targetPersonId: "p-1" }],
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.taskLimitReached");
    });

    it("creates task with targets (activity log via consumer)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (validateExactlyOneTarget as jest.Mock).mockReturnValue(true);
      (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "p-1" });
      (prisma.crmTask.count as jest.Mock).mockResolvedValue(0);
      (prisma.crmTask.create as jest.Mock).mockResolvedValue({ id: "task-1" });

      const result = await createCrmTask({
        title: "Follow up",
        targets: [{ targetPersonId: "p-1" }],
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "task-1" });
      expect(prisma.crmTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser.id,
            title: "Follow up",
            status: "pending",
          }),
        }),
      );
      expect(prisma.crmActivityLog.create).not.toHaveBeenCalled();
    });

    it("publishes CrmTaskCreated event", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (validateExactlyOneTarget as jest.Mock).mockReturnValue(true);
      (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "p-1" });
      (prisma.crmTask.count as jest.Mock).mockResolvedValue(0);
      (prisma.crmTask.create as jest.Mock).mockResolvedValue({ id: "task-42" });

      await createCrmTask({
        title: "Event Task",
        targets: [{ targetPersonId: "p-1" }],
      });

      expect(createEvent).toHaveBeenCalledWith(
        DomainEventType.CrmTaskCreated,
        expect.objectContaining({ taskId: "task-42", userId: mockUser.id, title: "Event Task" }),
      );
      expect(eventBus.publish).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // startCrmTask
  // ---------------------------------------------------------------------------

  describe("startCrmTask", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await startCrmTask("task-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("returns not found when task does not belong to user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await startCrmTask("task-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.taskNotFound");
    });

    it("rejects invalid transition (done -> in_progress)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue({ id: "task-1", status: "done", title: "T" });
      (isValidTaskTransition as jest.Mock).mockReturnValue(false);

      const result = await startCrmTask("task-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.invalidTransition");
    });

    it("updates status to in_progress", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue({ id: "task-1", status: "pending", title: "T" });
      (isValidTaskTransition as jest.Mock).mockReturnValue(true);
      (prisma.crmTask.update as jest.Mock).mockResolvedValue({});

      const result = await startCrmTask("task-1");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "task-1" });
      expect(prisma.crmTask.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "in_progress" } }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // completeCrmTask
  // ---------------------------------------------------------------------------

  describe("completeCrmTask", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await completeCrmTask("task-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("returns not found when task does not belong to user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await completeCrmTask("task-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.taskNotFound");
    });

    it("rejects invalid transition (done -> done)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue({ id: "task-1", status: "done", title: "T" });
      (isValidTaskTransition as jest.Mock).mockReturnValue(false);

      const result = await completeCrmTask("task-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.invalidTransition");
    });

    it("sets status=done and completedAt (activity log via consumer)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue({ id: "task-1", status: "in_progress", title: "Finish Me", targets: [] });
      (isValidTaskTransition as jest.Mock).mockReturnValue(true);
      (prisma.crmTask.update as jest.Mock).mockResolvedValue({});

      const result = await completeCrmTask("task-1");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "task-1" });
      expect(prisma.crmTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "done", completedAt: expect.any(Date) }),
        }),
      );
      expect(prisma.crmActivityLog.create).not.toHaveBeenCalled();
    });

    it("publishes CrmTaskCompleted event", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue({ id: "task-1", status: "in_progress", title: "Done Task", targets: [{ targetPersonId: "p-1", targetJobId: null }] });
      (isValidTaskTransition as jest.Mock).mockReturnValue(true);
      (prisma.crmTask.update as jest.Mock).mockResolvedValue({});

      await completeCrmTask("task-1");

      expect(createEvent).toHaveBeenCalledWith(
        DomainEventType.CrmTaskCompleted,
        expect.objectContaining({ taskId: "task-1", userId: mockUser.id, title: "Done Task" }),
      );
      expect(eventBus.publish).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // cancelCrmTask
  // ---------------------------------------------------------------------------

  describe("cancelCrmTask", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await cancelCrmTask("task-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("returns not found when task does not belong to user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await cancelCrmTask("task-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.taskNotFound");
    });

    it("rejects invalid transition (cancelled -> cancelled)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue({ id: "task-1", status: "cancelled", title: "T" });
      (isValidTaskTransition as jest.Mock).mockReturnValue(false);

      const result = await cancelCrmTask("task-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.invalidTransition");
    });

    it("sets status to cancelled", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue({ id: "task-1", status: "pending", title: "T" });
      (isValidTaskTransition as jest.Mock).mockReturnValue(true);
      (prisma.crmTask.update as jest.Mock).mockResolvedValue({});

      const result = await cancelCrmTask("task-1");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "task-1" });
      expect(prisma.crmTask.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "cancelled" } }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // deleteCrmTask
  // ---------------------------------------------------------------------------

  describe("deleteCrmTask", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await deleteCrmTask("task-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("returns not found when task does not belong to user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await deleteCrmTask("task-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.taskNotFound");
    });

    it("deletes successfully (cascade deletes targets via Prisma)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findFirst as jest.Mock).mockResolvedValue({ id: "task-1", status: "pending", title: "T" });
      (prisma.crmTask.delete as jest.Mock).mockResolvedValue({});

      const result = await deleteCrmTask("task-1");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "task-1" });
      expect(prisma.crmTask.delete).toHaveBeenCalledWith({ where: { id: "task-1" } });
    });
  });

  // ---------------------------------------------------------------------------
  // getCrmTasks
  // ---------------------------------------------------------------------------

  describe("getCrmTasks", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getCrmTasks();

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("returns tasks with targets", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const tasks = [
        { id: "task-1", title: "Task A", status: "pending", targets: [] },
        { id: "task-2", title: "Task B", status: "in_progress", targets: [] },
      ];
      (prisma.crmTask.findMany as jest.Mock).mockResolvedValue(tasks);

      const result = await getCrmTasks();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(tasks);
      expect(prisma.crmTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: mockUser.id }),
        }),
      );
    });

    it("filters by status", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findMany as jest.Mock).mockResolvedValue([]);

      await getCrmTasks({ status: "done" });

      expect(prisma.crmTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: mockUser.id, status: "done" }),
        }),
      );
    });

    it("filters by targetPersonId", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findMany as jest.Mock).mockResolvedValue([]);

      await getCrmTasks({ targetPersonId: "person-99" });

      expect(prisma.crmTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUser.id,
            targets: { some: { targetPersonId: "person-99" } },
          }),
        }),
      );
    });

    it("filters overdue tasks", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmTask.findMany as jest.Mock).mockResolvedValue([]);

      await getCrmTasks({ overdue: true });

      const callArg = (prisma.crmTask.findMany as jest.Mock).mock.calls[0][0];
      expect(callArg.where.dueDate).toEqual({ lte: expect.any(Date) });
      expect(callArg.where.status).toEqual({ in: ["pending", "in_progress"] });
    });
  });
});
