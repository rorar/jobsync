/**
 * Tests for G17 + #18 + G14 fixes.
 *
 * G17: rescheduled→rescheduled interview self-transition
 * #18: AutomationDegraded → CRM Activity Logger projection
 * G14: Push deep links via central URL resolution in ChannelRouter
 */

// ============================================================================
// G17: Interview self-transition
// ============================================================================

import { isValidInterviewTransition } from "@/models/person.model";

describe("G17: rescheduled→rescheduled self-transition", () => {
  it("allows rescheduled → rescheduled", () => {
    expect(isValidInterviewTransition("rescheduled", "rescheduled")).toBe(true);
  });

  it("still allows rescheduled → completed", () => {
    expect(isValidInterviewTransition("rescheduled", "completed")).toBe(true);
  });

  it("still allows rescheduled → cancelled", () => {
    expect(isValidInterviewTransition("rescheduled", "cancelled")).toBe(true);
  });

  it("still rejects rescheduled → scheduled", () => {
    expect(isValidInterviewTransition("rescheduled", "scheduled")).toBe(false);
  });

  it("still allows scheduled → rescheduled", () => {
    expect(isValidInterviewTransition("scheduled", "rescheduled")).toBe(true);
  });
});

// ============================================================================
// G14: ChannelRouter URL resolution
// ============================================================================

// Mock server-only
jest.mock("server-only", () => ({}));

// Mock shouldNotify to always allow
jest.mock("@/models/notification.model", () => ({
  ...jest.requireActual("@/models/notification.model"),
  shouldNotify: jest.fn(() => true),
}));

// Mock buildNotificationActions
const mockBuildActions = jest.fn();
jest.mock("@/lib/notifications/deep-links", () => ({
  buildNotificationActions: (...args: unknown[]) => mockBuildActions(...args),
}));

import { ChannelRouter } from "@/lib/notifications/channel-router";
import type { NotificationDraft } from "@/lib/notifications/types";
import { makeTestDispatchContext } from "@/lib/data/testFixtures";

describe("G14: ChannelRouter URL resolution", () => {
  let router: ChannelRouter;
  const mockChannel = {
    name: "push",
    dispatch: jest.fn().mockResolvedValue({ success: true, channel: "push" }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    router = new ChannelRouter();
    router.register(mockChannel);
  });

  it("resolves URL from buildNotificationActions when draft has no url", async () => {
    mockBuildActions.mockReturnValue([
      { url: "/dashboard/staging?automationId=abc", labelKey: "test", variant: "primary" },
    ]);

    const draft: NotificationDraft = {
      userId: "u1",
      type: "vacancy_batch_staged",
      message: "test",
      data: { automationId: "abc" },
    };
    const ctx = makeTestDispatchContext({ pushAvailable: true });

    await router.route(draft, ctx);

    expect(mockBuildActions).toHaveBeenCalledWith("vacancy_batch_staged", { automationId: "abc" });
    // Router creates a shallow copy with url — channel receives the enriched draft
    expect(mockChannel.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/dashboard/staging?automationId=abc" }),
      ctx,
    );
  });

  it("does NOT override url if draft already has one", async () => {
    const draft: NotificationDraft = {
      userId: "u1",
      type: "vacancy_batch_staged",
      message: "test",
      url: "/already-set",
    };
    const ctx = makeTestDispatchContext({ pushAvailable: true });

    await router.route(draft, ctx);

    expect(mockBuildActions).not.toHaveBeenCalled();
    // Channel receives the original url
    expect(mockChannel.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/already-set" }),
      ctx,
    );
  });

  it("leaves url undefined when buildNotificationActions returns empty", async () => {
    mockBuildActions.mockReturnValue([]);

    const draft: NotificationDraft = {
      userId: "u1",
      type: "vacancy_batch_staged",
      message: "test",
    };
    const ctx = makeTestDispatchContext({ pushAvailable: true });

    await router.route(draft, ctx);

    // Channel receives draft without url (no action matched)
    expect(mockChannel.dispatch).toHaveBeenCalledWith(
      expect.not.objectContaining({ url: expect.anything() }),
      ctx,
    );
  });
});
