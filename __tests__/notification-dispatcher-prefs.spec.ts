/**
 * NotificationDispatcher — Preference-aware dispatching tests
 *
 * Verifies that the dispatcher checks user preferences before creating notifications.
 */

import { _testHelpers } from "@/lib/events/consumers/notification-dispatcher";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/models/notification.model";

// Mock Prisma
const mockCreate = jest.fn().mockResolvedValue({});
const mockFindUnique = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    notification: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
    userSettings: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

describe("NotificationDispatcher resolvePreferences", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns DEFAULT_NOTIFICATION_PREFERENCES when no settings exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    const prefs = await _testHelpers.resolvePreferences("user-1");

    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("returns DEFAULT_NOTIFICATION_PREFERENCES when settings have no notifications key", async () => {
    mockFindUnique.mockResolvedValue({
      id: "settings-1",
      userId: "user-1",
      settings: JSON.stringify({ ai: { moduleId: "ollama", model: "llama3" } }),
    });

    const prefs = await _testHelpers.resolvePreferences("user-1");

    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns stored notification preferences when they exist", async () => {
    const storedPrefs = {
      enabled: false,
      channels: { inApp: true },
      perType: { vacancy_promoted: { enabled: false } },
    };
    mockFindUnique.mockResolvedValue({
      id: "settings-1",
      userId: "user-1",
      settings: JSON.stringify({ notifications: storedPrefs }),
    });

    const prefs = await _testHelpers.resolvePreferences("user-1");

    expect(prefs).toEqual(storedPrefs);
  });

  it("returns defaults on DB error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB connection failed"));

    const prefs = await _testHelpers.resolvePreferences("user-1");

    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });
});

describe("NotificationDispatcher flushStagedBuffer with preferences", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    _testHelpers.stagedBuffers.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates a notification when preferences allow it", async () => {
    // User has default preferences (everything enabled)
    mockFindUnique.mockResolvedValue(null);

    // Simulate a staged buffer entry
    _testHelpers.stagedBuffers.set("auto-1", {
      userId: "user-1",
      count: 5,
      timer: setTimeout(() => {}, 0),
    });

    await _testHelpers.flushStagedBuffer("auto-1");

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "vacancy_batch_staged",
      }),
    });
  });

  it("skips notification when user has disabled globally", async () => {
    mockFindUnique.mockResolvedValue({
      id: "s-1",
      userId: "user-1",
      settings: JSON.stringify({
        notifications: {
          enabled: false,
          channels: { inApp: true, webhook: false },
          perType: {},
        },
      }),
    });

    _testHelpers.stagedBuffers.set("auto-2", {
      userId: "user-1",
      count: 3,
      timer: setTimeout(() => {}, 0),
    });

    await _testHelpers.flushStagedBuffer("auto-2");

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("skips notification when specific type is disabled", async () => {
    mockFindUnique.mockResolvedValue({
      id: "s-1",
      userId: "user-1",
      settings: JSON.stringify({
        notifications: {
          enabled: true,
          channels: { inApp: true, webhook: false },
          perType: { vacancy_batch_staged: { enabled: false } },
        },
      }),
    });

    _testHelpers.stagedBuffers.set("auto-3", {
      userId: "user-1",
      count: 2,
      timer: setTimeout(() => {}, 0),
    });

    await _testHelpers.flushStagedBuffer("auto-3");

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
