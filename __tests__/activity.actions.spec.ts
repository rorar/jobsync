import {
  getAllActivityTypes,
  getActivityTypeList,
  createActivityType,
  deleteActivityTypeById,
  getActivitiesList,
  getActivityById,
  updateActivity,
} from "@/actions/activity.actions";
import { Activity } from "@/models/activity.model";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    activity: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    activityType: {
      findMany: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

describe("activity.actions", () => {
  const mockUser = { id: "user-id" };

  const mockActivities = [
    {
      id: "1",
      activityName: "TypeScript Learning",
      startTime: new Date("2024-06-19T09:00:00"),
      endTime: new Date("2024-06-19T10:00:00"),
      duration: 60,
      description: "Learning TypeScript advanced concepts",
      createdAt: new Date("2024-06-19"),
      activityType: { id: "1", label: "Learning", value: "learning" },
    },
    {
      id: "2",
      activityName: "Build Portfolio",
      startTime: new Date("2024-06-19T11:00:00"),
      endTime: new Date("2024-06-19T12:30:00"),
      duration: 90,
      description: "Working on portfolio website",
      createdAt: new Date("2024-06-19"),
      activityType: { id: "2", label: "Side Project", value: "side-project" },
    },
    {
      id: "3",
      activityName: "Job Search",
      startTime: new Date("2024-06-20T14:00:00"),
      endTime: new Date("2024-06-20T15:00:00"),
      duration: 60,
      description: "Applying to developer positions",
      createdAt: new Date("2024-06-20"),
      activityType: { id: "3", label: "Job Search", value: "job-search" },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAllActivityTypes", () => {
    it("should return all activity types for authenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const mockTypes = [
        { id: "1", label: "Learning", value: "learning" },
        { id: "2", label: "Side Project", value: "side-project" },
      ];
      (prisma.activityType.findMany as jest.Mock).mockResolvedValue(mockTypes);

      const result = await getAllActivityTypes();

      expect(result).toEqual({ success: true, data: mockTypes });
      expect(prisma.activityType.findMany).toHaveBeenCalledWith({
        where: { createdBy: mockUser.id },
      });
    });

    it("should return error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getAllActivityTypes();

      expect(result).toEqual({ success: false, message: "errors.fetchFailed" });
      expect(prisma.activityType.findMany).not.toHaveBeenCalled();
    });

    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activityType.findMany as jest.Mock).mockRejectedValue(
        new Error("Database error")
      );

      const result = await getAllActivityTypes();

      expect(result).toEqual({ success: false, message: "errors.fetchFailed" });
    });
  });

  describe("createActivityType", () => {
    it("should upsert an activity type successfully", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const mockType = {
        id: "type-1",
        label: "Learning",
        value: "learning",
        createdBy: mockUser.id,
      };
      (prisma.activityType.upsert as jest.Mock).mockResolvedValue(mockType);

      const result = await createActivityType("Learning");

      expect(result).toEqual({ success: true, data: mockType });
      expect(prisma.activityType.upsert).toHaveBeenCalledWith({
        where: { value_createdBy: { value: "learning", createdBy: mockUser.id } },
        update: { label: "Learning" },
        create: {
          label: "Learning",
          value: "learning",
          createdBy: mockUser.id,
        },
      });
    });

    it("should return error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await createActivityType("Learning");

      expect(result).toEqual({ success: false, message: "errors.createFailed" });
      expect(prisma.activityType.upsert).not.toHaveBeenCalled();
    });

    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activityType.upsert as jest.Mock).mockRejectedValue(
        new Error("Upsert failed")
      );

      const result = await createActivityType("Learning");

      expect(result).toEqual({ success: false, message: "errors.createFailed" });
    });
  });

  describe("getActivityTypeList", () => {
    it("should return a paginated activity type list", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const mockData = [
        { id: "type-1", label: "Learning", value: "learning" },
      ];
      (prisma.activityType.findMany as jest.Mock).mockResolvedValue(mockData);
      (prisma.activityType.count as jest.Mock).mockResolvedValue(1);

      const result = await getActivityTypeList(1, 10);

      expect(result).toEqual({ success: true, data: mockData, total: 1 });
      expect(prisma.activityType.findMany).toHaveBeenCalledWith({
        where: { createdBy: mockUser.id },
        skip: 0,
        take: 10,
        orderBy: { Activities: { _count: "desc" } },
      });
      expect(prisma.activityType.count).toHaveBeenCalledWith({
        where: { createdBy: mockUser.id },
      });
    });

    it("should select the capitalised relation counts when countBy is given", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const mockData = [
        {
          id: "type-1",
          label: "Learning",
          value: "learning",
          createdBy: mockUser.id,
          _count: { Activities: 4, Tasks: 2 },
        },
      ];
      (prisma.activityType.findMany as jest.Mock).mockResolvedValue(mockData);
      (prisma.activityType.count as jest.Mock).mockResolvedValue(1);

      const result = await getActivityTypeList(1, 10, "activities");

      expect(result).toEqual({ success: true, data: mockData, total: 1 });
      // The relation names come from prisma/schema.prisma:491-492 and are
      // capitalised; a lower-case key here would be a runtime Prisma error that
      // no type would catch, because the object is built by spread.
      expect(prisma.activityType.findMany).toHaveBeenCalledWith({
        where: { createdBy: mockUser.id },
        skip: 0,
        take: 10,
        select: {
          id: true,
          label: true,
          value: true,
          createdBy: true,
          _count: {
            select: {
              Activities: true,
              Tasks: true,
            },
          },
        },
        orderBy: { Activities: { _count: "desc" } },
      });
    });

    it("should calculate skip correctly for page 2", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activityType.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.activityType.count as jest.Mock).mockResolvedValue(0);

      await getActivityTypeList(2, 10);

      expect(prisma.activityType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });

    it("should return error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getActivityTypeList(1, 10);

      expect(result).toEqual({ success: false, message: "errors.fetchFailed" });
      expect(prisma.activityType.findMany).not.toHaveBeenCalled();
    });

    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activityType.findMany as jest.Mock).mockRejectedValue(
        new Error("Database error")
      );

      const result = await getActivityTypeList(1, 10);

      expect(result).toEqual({ success: false, message: "errors.fetchFailed" });
    });
  });

  describe("deleteActivityTypeById", () => {
    it("should delete an activity type successfully", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.count as jest.Mock).mockResolvedValue(0);
      const mockDeleted = { id: "type-1", label: "Learning" };
      (prisma.activityType.delete as jest.Mock).mockResolvedValue(mockDeleted);

      const result = await deleteActivityTypeById("type-1");

      expect(result).toEqual({ success: true, data: mockDeleted });
      // ADR-015 regression guard: the delete must be scoped to the owner.
      expect(prisma.activityType.delete).toHaveBeenCalledWith({
        where: { id: "type-1", createdBy: mockUser.id },
      });
    });

    it("should scope the activity guard to this user (ADR-015)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.count as jest.Mock).mockResolvedValue(0);
      (prisma.activityType.delete as jest.Mock).mockResolvedValue({
        id: "type-1",
      });

      await deleteActivityTypeById("type-1");

      // Asserting the WHERE clause, not just the call count: an unscoped count
      // would let another user's activity block this delete and leak that the
      // row exists. That exact defect survived in two sibling action files
      // because their tests only counted calls.
      expect(prisma.activity.count).toHaveBeenCalledWith({
        where: { activityTypeId: "type-1", userId: mockUser.id },
      });
    });

    it("should return error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await deleteActivityTypeById("type-1");

      expect(result).toEqual({ success: false, message: "errors.deleteFailed" });
      expect(prisma.activityType.delete).not.toHaveBeenCalled();
    });

    it("should prevent deletion when activities exist", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.count as jest.Mock).mockResolvedValue(3);

      const result = await deleteActivityTypeById("type-1");

      expect(result).toEqual({
        success: false,
        message: "errors.deleteFailed",
      });
      expect(prisma.activityType.delete).not.toHaveBeenCalled();
    });

    it("should delete when only tasks reference the activity type", async () => {
      // The asymmetry this pins: Activity_activityTypeId_fkey is ON DELETE
      // RESTRICT over a NOT NULL column, but Task_activityTypeId_fkey is
      // ON DELETE SET NULL over a nullable one. A task with no activity type is
      // a valid state, so tasks must NOT block the delete. Written backwards,
      // this test would enshrine a type nobody can ever remove.
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.count as jest.Mock).mockResolvedValue(0);
      const mockDeleted = {
        id: "type-1",
        label: "Learning",
        _count: { Activities: 0, Tasks: 7 },
      };
      (prisma.activityType.delete as jest.Mock).mockResolvedValue(mockDeleted);

      const result = await deleteActivityTypeById("type-1");

      expect(result).toEqual({ success: true, data: mockDeleted });
      expect(prisma.activityType.delete).toHaveBeenCalledWith({
        where: { id: "type-1", createdBy: mockUser.id },
      });
    });

    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.count as jest.Mock).mockResolvedValue(0);
      (prisma.activityType.delete as jest.Mock).mockRejectedValue(
        new Error("Delete failed")
      );

      const result = await deleteActivityTypeById("type-1");

      expect(result).toEqual({ success: false, message: "errors.deleteFailed" });
    });
  });

  describe("getActivitiesList", () => {
    it("should retrieve activities with default parameters", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.findMany as jest.Mock).mockResolvedValue(mockActivities);
      (prisma.activity.count as jest.Mock).mockResolvedValue(3);

      const result = await getActivitiesList();

      expect(result).toEqual({
        success: true,
        data: mockActivities,
        total: 3,
      });
      expect(prisma.activity.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.activity.count).toHaveBeenCalledTimes(1);
    });

    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getActivitiesList();

      expect(result).toEqual({
        success: false,
        message: "errors.fetchFailed",
      });
    });

    it("should return error when fetching data fails", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.findMany as jest.Mock).mockRejectedValue(
        new Error("Database error")
      );

      const result = await getActivitiesList();

      expect(result).toEqual({
        success: false,
        message: "errors.fetchFailed",
      });
    });

    describe("search functionality", () => {
      it("should build OR clause when search parameter is provided", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.activity.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.activity.count as jest.Mock).mockResolvedValue(0);

        await getActivitiesList(1, 25, "TypeScript");

        expect(prisma.activity.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              userId: mockUser.id,
              endTime: { not: null },
              OR: [
                { activityName: { contains: "TypeScript" } },
                { description: { contains: "TypeScript" } },
                { activityType: { label: { contains: "TypeScript" } } },
              ],
            }),
          })
        );
        expect(prisma.activity.count).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              OR: [
                { activityName: { contains: "TypeScript" } },
                { description: { contains: "TypeScript" } },
                { activityType: { label: { contains: "TypeScript" } } },
              ],
            }),
          })
        );
      });

      it("should search across activity name", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.activity.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.activity.count as jest.Mock).mockResolvedValue(0);

        await getActivitiesList(1, 25, "Portfolio");

        const findManyCall = (prisma.activity.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.OR).toContainEqual({
          activityName: { contains: "Portfolio" },
        });
      });

      it("should search across description", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.activity.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.activity.count as jest.Mock).mockResolvedValue(0);

        await getActivitiesList(1, 25, "developer");

        const findManyCall = (prisma.activity.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.OR).toContainEqual({
          description: { contains: "developer" },
        });
      });

      it("should search across activity type label", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.activity.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.activity.count as jest.Mock).mockResolvedValue(0);

        await getActivitiesList(1, 25, "Learning");

        const findManyCall = (prisma.activity.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.OR).toContainEqual({
          activityType: { label: { contains: "Learning" } },
        });
      });

      it("should not include OR clause when search is undefined", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.activity.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.activity.count as jest.Mock).mockResolvedValue(0);

        await getActivitiesList(1, 25, undefined);

        const findManyCall = (prisma.activity.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.OR).toBeUndefined();
      });

      it("should not include OR clause when search is empty string", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.activity.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.activity.count as jest.Mock).mockResolvedValue(0);

        await getActivitiesList(1, 25, "");

        const findManyCall = (prisma.activity.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.OR).toBeUndefined();
      });

      it("should return filtered results with correct pagination", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        const mockFilteredData = [mockActivities[0]];
        (prisma.activity.findMany as jest.Mock).mockResolvedValue(
          mockFilteredData
        );
        (prisma.activity.count as jest.Mock).mockResolvedValue(1);

        const result = await getActivitiesList(1, 25, "TypeScript");

        expect(result).toEqual({
          success: true,
          data: mockFilteredData,
          total: 1,
        });
      });

      it("should apply pagination with skip and take", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.activity.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.activity.count as jest.Mock).mockResolvedValue(0);

        await getActivitiesList(2, 10, "test");

        expect(prisma.activity.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            skip: 10,
            take: 10,
          })
        );
      });

      it("should order results by createdAt descending", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.activity.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.activity.count as jest.Mock).mockResolvedValue(0);

        await getActivitiesList(1, 25, "test");

        expect(prisma.activity.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { createdAt: "desc" },
          })
        );
      });

      it("should only return completed activities (with endTime)", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.activity.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.activity.count as jest.Mock).mockResolvedValue(0);

        await getActivitiesList(1, 25, "test");

        const findManyCall = (prisma.activity.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.endTime).toEqual({ not: null });
      });
    });
  });

  describe("getActivityById", () => {
    const mockActivity = {
      id: "activity-1",
      activityName: "TypeScript Learning",
      startTime: new Date("2024-06-19T09:00:00"),
      endTime: new Date("2024-06-19T10:00:00"),
      duration: 60,
      description: "Learning TypeScript advanced concepts",
      userId: "user-id",
      activityTypeId: "type-1",
      createdAt: new Date("2024-06-19"),
      activityType: { id: "type-1", label: "Learning", value: "learning" },
    };

    it("should return error when not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getActivityById("activity-1");

      expect(result).toEqual({
        success: false,
        message: "errors.fetchFailed",
      });
      expect(prisma.activity.findFirst).not.toHaveBeenCalled();
    });

    it("should return error when activity not found", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await getActivityById("non-existent-id");

      expect(result).toEqual({
        success: false,
        message: "errors.notFound",
      });
      expect(prisma.activity.findFirst).toHaveBeenCalledWith({
        where: {
          id: "non-existent-id",
          userId: mockUser.id,
        },
        include: {
          activityType: true,
        },
      });
    });

    it("should return activity with activityType when found and user owns it", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.findFirst as jest.Mock).mockResolvedValue(mockActivity);

      const result = await getActivityById("activity-1");

      expect(result).toEqual({
        success: true,
        data: mockActivity,
      });
      expect(prisma.activity.findFirst).toHaveBeenCalledWith({
        where: {
          id: "activity-1",
          userId: mockUser.id,
        },
        include: {
          activityType: true,
        },
      });
    });

    it("should return error when activity belongs to different user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      // findFirst with userId filter returns null when activity belongs to another user
      (prisma.activity.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await getActivityById("other-user-activity");

      expect(result).toEqual({
        success: false,
        message: "errors.notFound",
      });
      expect(prisma.activity.findFirst).toHaveBeenCalledWith({
        where: {
          id: "other-user-activity",
          userId: mockUser.id,
        },
        include: {
          activityType: true,
        },
      });
    });

    it("should handle database errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.findFirst as jest.Mock).mockRejectedValue(
        new Error("Database error")
      );

      const result = await getActivityById("activity-1");

      expect(result).toEqual({
        success: false,
        message: "errors.fetchFailed",
      });
    });
  });

  describe("updateActivity", () => {
    const mockActivityType = {
      id: "type-1",
      label: "Learning",
      value: "learning",
      description: null as string | null,
      createdBy: "user-id",
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    };

    const updateData: Activity = {
      id: "activity-1",
      activityName: "Updated Activity",
      activityTypeId: "type-1",
      activityType: mockActivityType,
      userId: "user-id",
      startTime: new Date("2024-06-19T09:00:00"),
      endTime: new Date("2024-06-19T11:00:00"),
      duration: 120,
      description: "Updated description",
      taskId: null,
      createdAt: new Date("2024-06-19"),
      updatedAt: new Date("2024-06-19"),
    };

    const existingActivity = {
      id: "activity-1",
      activityName: "Original Activity",
      activityTypeId: "type-1",
      userId: "user-id",
      startTime: new Date("2024-06-19T09:00:00"),
      endTime: new Date("2024-06-19T10:00:00"),
      duration: 60,
      description: "Original description",
    };

    const updatedActivity = {
      id: "activity-1",
      activityName: "Updated Activity",
      activityTypeId: "type-1",
      userId: "user-id",
      startTime: new Date("2024-06-19T09:00:00"),
      endTime: new Date("2024-06-19T11:00:00"),
      duration: 120,
      description: "Updated description",
      activityType: mockActivityType,
    };

    it("should return error when not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await updateActivity(updateData);

      expect(result).toEqual({
        success: false,
        message: "errors.updateFailed",
      });
      expect(prisma.activity.findFirst).not.toHaveBeenCalled();
      expect(prisma.activity.update).not.toHaveBeenCalled();
    });

    it("should return error when activity ID is missing", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      const dataWithoutId = { ...updateData };
      delete (dataWithoutId as any).id;

      const result = await updateActivity(dataWithoutId);

      expect(result).toEqual({
        success: false,
        message: "errors.updateFailed",
      });
      expect(prisma.activity.findFirst).not.toHaveBeenCalled();
      expect(prisma.activity.update).not.toHaveBeenCalled();
    });

    it("should return error when activity not found or not owned by user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await updateActivity(updateData);

      expect(result).toEqual({
        success: false,
        message: "errors.notFound",
      });
      expect(prisma.activity.findFirst).toHaveBeenCalledWith({
        where: {
          id: updateData.id,
          userId: mockUser.id,
        },
      });
      expect(prisma.activity.update).not.toHaveBeenCalled();
    });

    it("should successfully update activity and return updated data", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.findFirst as jest.Mock).mockResolvedValue(existingActivity);
      (prisma.activity.update as jest.Mock).mockResolvedValue(updatedActivity);

      const result = await updateActivity(updateData);

      expect(result).toEqual({
        success: true,
        data: updatedActivity,
        message: "activities.updateSuccess",
      });
      expect(prisma.activity.findFirst).toHaveBeenCalledWith({
        where: {
          id: updateData.id,
          userId: mockUser.id,
        },
      });
      expect(prisma.activity.update).toHaveBeenCalledWith({
        where: {
          id: updateData.id,
        },
        data: {
          activityName: updateData.activityName,
          activityTypeId: updateData.activityTypeId,
          startTime: updateData.startTime,
          endTime: updateData.endTime,
          duration: updateData.duration,
          description: updateData.description,
        },
        include: {
          activityType: true,
        },
      });
    });

    it("should handle database errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.activity.findFirst as jest.Mock).mockResolvedValue(existingActivity);
      (prisma.activity.update as jest.Mock).mockRejectedValue(
        new Error("Database error")
      );

      const result = await updateActivity(updateData);

      expect(result).toEqual({
        success: false,
        message: "errors.updateFailed",
      });
    });
  });
});
