import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dismissNotification,
} from "@/actions/notification.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

describe("Notification Actions", () => {
  const mockUser = { id: "user-id" };
  const now = new Date();
  const mockNotification = {
    id: "notif-1",
    userId: mockUser.id,
    type: "auth_failure",
    message: 'Automation "My Auto" paused: authentication failed.',
    moduleId: "eures",
    automationId: "auto-1",
    read: false,
    createdAt: now,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // getNotifications
  // =========================================================================
  describe("getNotifications", () => {
    it("should return all notifications for the authenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        mockNotification,
      ]);

      const result = await getNotifications();

      expect(result).toEqual({ success: true, data: [mockNotification] });
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    });

    it("should filter to unread only when unreadOnly is true", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);

      await getNotifications(true);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, read: false },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    });

    it("should respect custom limit parameter", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);

      await getNotifications(false, 5);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });

    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getNotifications();

      expect(result).toEqual({ success: false, message: "Not authenticated" });
      expect(prisma.notification.findMany).not.toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.findMany as jest.Mock).mockRejectedValue(
        new Error("Database error"),
      );

      const result = await getNotifications();

      expect(result).toEqual({ success: false, message: "Database error" });
    });
  });

  // =========================================================================
  // getUnreadCount
  // =========================================================================
  describe("getUnreadCount", () => {
    it("should return the count of unread notifications", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.count as jest.Mock).mockResolvedValue(7);

      const result = await getUnreadCount();

      expect(result).toEqual({ success: true, data: 7 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: mockUser.id, read: false },
      });
    });

    it("should return 0 when there are no unread notifications", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.count as jest.Mock).mockResolvedValue(0);

      const result = await getUnreadCount();

      expect(result).toEqual({ success: true, data: 0 });
    });

    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getUnreadCount();

      expect(result).toEqual({ success: false, message: "Not authenticated" });
      expect(prisma.notification.count).not.toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.count as jest.Mock).mockRejectedValue(
        new Error("Database error"),
      );

      const result = await getUnreadCount();

      expect(result).toEqual({ success: false, message: "Database error" });
    });
  });

  // =========================================================================
  // markAsRead
  // =========================================================================
  describe("markAsRead", () => {
    it("should mark a single notification as read", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.update as jest.Mock).mockResolvedValue({
        ...mockNotification,
        read: true,
      });

      const result = await markAsRead("notif-1");

      expect(result).toEqual({ success: true });
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: "notif-1", userId: mockUser.id },
        data: { read: true },
      });
    });

    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await markAsRead("notif-1");

      expect(result).toEqual({ success: false, message: "Not authenticated" });
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it("should handle database errors (e.g. notification not found)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.update as jest.Mock).mockRejectedValue(
        new Error("Record to update not found."),
      );

      const result = await markAsRead("non-existent-id");

      expect(result).toEqual({
        success: false,
        message: "Record to update not found.",
      });
    });
  });

  // =========================================================================
  // markAllAsRead
  // =========================================================================
  describe("markAllAsRead", () => {
    it("should mark all unread notifications as read for the user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({
        count: 3,
      });

      const result = await markAllAsRead();

      expect(result).toEqual({ success: true });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, read: false },
        data: { read: true },
      });
    });

    it("should succeed even when there are no unread notifications", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      const result = await markAllAsRead();

      expect(result).toEqual({ success: true });
    });

    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await markAllAsRead();

      expect(result).toEqual({ success: false, message: "Not authenticated" });
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.updateMany as jest.Mock).mockRejectedValue(
        new Error("Database error"),
      );

      const result = await markAllAsRead();

      expect(result).toEqual({ success: false, message: "Database error" });
    });
  });

  // =========================================================================
  // dismissNotification
  // =========================================================================
  describe("dismissNotification", () => {
    it("should delete the notification", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.delete as jest.Mock).mockResolvedValue(
        mockNotification,
      );

      const result = await dismissNotification("notif-1");

      expect(result).toEqual({ success: true });
      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: "notif-1", userId: mockUser.id },
      });
    });

    it("should fail without auth", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await dismissNotification("notif-1");

      expect(result).toEqual({ success: false, message: "Not authenticated" });
      expect(prisma.notification.delete).not.toHaveBeenCalled();
    });

    it("should handle database errors (e.g. notification not found)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.delete as jest.Mock).mockRejectedValue(
        new Error("Record to delete does not exist."),
      );

      const result = await dismissNotification("non-existent-id");

      expect(result).toEqual({
        success: false,
        message: "Record to delete does not exist.",
      });
    });
  });
});
