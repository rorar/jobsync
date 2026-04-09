/**
 * WebhookChannel Tests
 *
 * Tests: HMAC signature, retry logic, backoff intervals, auto-deactivation,
 * SSRF re-validation, failure count reset, event filtering, timeout handling.
 *
 * Spec: specs/notification-dispatch.allium
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockFindMany = jest.fn();
const mockUpdate = jest.fn().mockResolvedValue({ failureCount: 1 });
const mockCount = jest.fn();
const mockNotificationCreate = jest.fn().mockResolvedValue({ id: "notif-1" });
const mockUserSettingsFindUnique = jest.fn().mockResolvedValue(null);

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    webhookEndpoint: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
    userSettings: {
      findUnique: (...args: unknown[]) => mockUserSettingsFindUnique(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Encryption mock
// ---------------------------------------------------------------------------

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((_encrypted: string, _iv: string) => "test-secret-key"),
}));

// ---------------------------------------------------------------------------
// i18n dictionaries mock
// ---------------------------------------------------------------------------

jest.mock("@/i18n/dictionaries", () => ({
  t: jest.fn((_locale: string, key: string) => {
    const translations: Record<string, string> = {
      "webhook.deliveryFailed": 'Webhook delivery failed for event "{eventType}" to {url}',
      "webhook.endpointDeactivated": "Webhook endpoint {url} deactivated due to repeated failures",
    };
    return translations[key] ?? key;
  }),
}));

// ---------------------------------------------------------------------------
// Locale resolver mock
// ---------------------------------------------------------------------------

jest.mock("@/lib/locale-resolver", () => ({
  resolveUserLocale: jest.fn().mockResolvedValue("en"),
}));

// ---------------------------------------------------------------------------
// URL validation mock
// ---------------------------------------------------------------------------

const mockValidateWebhookUrl = jest.fn().mockReturnValue({ valid: true });

jest.mock("@/lib/url-validation", () => ({
  validateWebhookUrl: (...args: unknown[]) => mockValidateWebhookUrl(...args),
}));

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import {
  WebhookChannel,
  computeHmacSignature,
  _testHelpers,
} from "@/lib/notifications/channels/webhook.channel";
import { createHmac } from "crypto";
import type { NotificationDraft } from "@/lib/notifications/types";

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = jest.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function getMockFetch(): jest.Mock {
  return globalThis.fetch as jest.Mock;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = "user-42";

function makeDraft(
  overrides: Partial<NotificationDraft> = {},
): NotificationDraft {
  return {
    userId: TEST_USER_ID,
    type: "vacancy_promoted",
    message: "Job created from staged vacancy",
    data: { jobId: "job-1" },
    ...overrides,
  };
}

function makeEndpoint(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ep-1",
    url: "https://example.com/webhook",
    secret: "encrypted-secret",
    iv: "test-iv",
    events: JSON.stringify(["vacancy_promoted", "module_deactivated"]),
    failureCount: 0,
    ...overrides,
  };
}

/**
 * Helper to run a dispatch that involves retries with fake timers.
 * Uses jest fake timers to avoid real delays during retry backoff.
 */
async function dispatchWithFakeTimers(
  channel: WebhookChannel,
  draft: NotificationDraft,
  userId: string,
) {
  jest.useFakeTimers();

  const dispatchPromise = channel.dispatch(draft, userId);

  // Advance timers in a loop until the promise resolves.
  // Each iteration advances past one retry backoff period.
  // The maximum total backoff is 1s + 5s + 30s = 36s.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve(); // flush microtasks
    jest.advanceTimersByTime(35_000);
    await Promise.resolve(); // flush microtasks
  }

  const result = await dispatchPromise;

  jest.useRealTimers();
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebhookChannel", () => {
  let channel: WebhookChannel;

  beforeEach(() => {
    jest.clearAllMocks();
    channel = new WebhookChannel();
    mockValidateWebhookUrl.mockReturnValue({ valid: true });
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  describe("computeHmacSignature", () => {
    it("computes correct HMAC-SHA256 signature", () => {
      const secret = "my-webhook-secret";
      const payload = JSON.stringify({
        event: "test",
        timestamp: "2026-01-01T00:00:00Z",
        data: {},
      });

      const result = computeHmacSignature(secret, payload);

      // Verify against Node.js crypto directly
      const expected = createHmac("sha256", secret)
        .update(payload)
        .digest("hex");
      expect(result).toBe(expected);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces different signatures for different secrets", () => {
      const payload = JSON.stringify({ event: "test" });
      const sig1 = computeHmacSignature("secret-1", payload);
      const sig2 = computeHmacSignature("secret-2", payload);
      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures for different payloads", () => {
      const secret = "shared-secret";
      const sig1 = computeHmacSignature(secret, '{"event":"a"}');
      const sig2 = computeHmacSignature(secret, '{"event":"b"}');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe("dispatch", () => {
    it("sends POST with correct headers and HMAC signature", async () => {
      const endpoint = makeEndpoint();
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch().mockResolvedValue({ ok: true, status: 200 });

      const draft = makeDraft();
      await channel.dispatch(draft, TEST_USER_ID);

      expect(getMockFetch()).toHaveBeenCalledTimes(1);
      const [url, options] = getMockFetch().mock.calls[0];
      expect(url).toBe("https://example.com/webhook");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers["X-Webhook-Event"]).toBe("vacancy_promoted");
      expect(options.headers["User-Agent"]).toBe("JobSync-Webhook/1.0");

      // Verify signature header format
      expect(options.headers["X-Webhook-Signature"]).toMatch(
        /^sha256=[0-9a-f]{64}$/,
      );

      // Verify signature correctness
      const expectedSig = computeHmacSignature("test-secret-key", options.body);
      expect(options.headers["X-Webhook-Signature"]).toBe(
        `sha256=${expectedSig}`,
      );
    });

    it("builds correct WebhookPayload envelope", async () => {
      const endpoint = makeEndpoint();
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch().mockResolvedValue({ ok: true, status: 200 });

      const draft = makeDraft({ data: { jobId: "j-1", title: "Engineer" } });
      await channel.dispatch(draft, TEST_USER_ID);

      const body = JSON.parse(getMockFetch().mock.calls[0][1].body);
      expect(body.event).toBe("vacancy_promoted");
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(body.data).toEqual({ jobId: "j-1", title: "Engineer" });
    });

    it("filters endpoints by subscribed event types", async () => {
      const ep1 = makeEndpoint({
        id: "ep-1",
        events: JSON.stringify(["vacancy_promoted"]),
      });
      const ep2 = makeEndpoint({
        id: "ep-2",
        url: "https://other.com/hook",
        events: JSON.stringify(["module_deactivated"]),
      });
      mockFindMany.mockResolvedValue([ep1, ep2]);
      getMockFetch().mockResolvedValue({ ok: true, status: 200 });

      const draft = makeDraft({ type: "vacancy_promoted" });
      await channel.dispatch(draft, TEST_USER_ID);

      // Only ep-1 should receive the call
      expect(getMockFetch()).toHaveBeenCalledTimes(1);
      expect(getMockFetch().mock.calls[0][0]).toBe(
        "https://example.com/webhook",
      );
    });

    it("returns success with no endpoints", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await channel.dispatch(makeDraft(), TEST_USER_ID);
      expect(result.success).toBe(true);
      expect(result.channel).toBe("webhook");
      expect(getMockFetch()).not.toHaveBeenCalled();
    });

    it("returns success when no endpoints match event type", async () => {
      const ep = makeEndpoint({
        events: JSON.stringify(["module_deactivated"]),
      });
      mockFindMany.mockResolvedValue([ep]);

      const draft = makeDraft({ type: "vacancy_promoted" });
      const result = await channel.dispatch(draft, TEST_USER_ID);
      expect(result.success).toBe(true);
      expect(getMockFetch()).not.toHaveBeenCalled();
    });

    it("resets failureCount to 0 on successful delivery", async () => {
      const endpoint = makeEndpoint({ failureCount: 3 });
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch().mockResolvedValue({ ok: true, status: 200 });

      await channel.dispatch(makeDraft(), TEST_USER_ID);

      // H3: userId must be in where clause (IDOR protection)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "ep-1", userId: TEST_USER_ID },
        data: { failureCount: 0 },
      });
    });

    it("does not update failureCount if already 0 on success", async () => {
      const endpoint = makeEndpoint({ failureCount: 0 });
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch().mockResolvedValue({ ok: true, status: 200 });

      await channel.dispatch(makeDraft(), TEST_USER_ID);

      // Should not call update since failureCount is already 0
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("queries endpoints with userId and active filter", async () => {
      mockFindMany.mockResolvedValue([]);

      await channel.dispatch(makeDraft(), TEST_USER_ID);

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, active: true },
        select: {
          id: true,
          url: true,
          secret: true,
          iv: true,
          events: true,
          failureCount: true,
        },
      });
    });
  });

  describe("SSRF re-validation on dispatch", () => {
    it("blocks delivery when URL fails SSRF validation", async () => {
      const endpoint = makeEndpoint({ url: "http://169.254.169.254/metadata" });
      mockFindMany.mockResolvedValue([endpoint]);
      mockValidateWebhookUrl.mockReturnValue({
        valid: false,
        error: "webhook.ssrfBlocked",
      });

      const result = await channel.dispatch(makeDraft(), TEST_USER_ID);

      expect(getMockFetch()).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toContain("SSRF blocked");
    });

    it("calls validateWebhookUrl for each endpoint on dispatch", async () => {
      const ep1 = makeEndpoint({ id: "ep-1", url: "https://a.com/hook" });
      const ep2 = makeEndpoint({ id: "ep-2", url: "https://b.com/hook" });
      mockFindMany.mockResolvedValue([ep1, ep2]);
      getMockFetch().mockResolvedValue({ ok: true, status: 200 });

      await channel.dispatch(makeDraft(), TEST_USER_ID);

      expect(mockValidateWebhookUrl).toHaveBeenCalledWith("https://a.com/hook");
      expect(mockValidateWebhookUrl).toHaveBeenCalledWith("https://b.com/hook");
    });
  });

  describe("retry logic", () => {
    it("retries up to 3 times on failure", async () => {
      const endpoint = makeEndpoint();
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 502 })
        .mockResolvedValueOnce({ ok: false, status: 503 });

      await dispatchWithFakeTimers(channel, makeDraft(), TEST_USER_ID);

      expect(getMockFetch()).toHaveBeenCalledTimes(3);
    });

    it("stops retrying on first success", async () => {
      const endpoint = makeEndpoint();
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await dispatchWithFakeTimers(channel, makeDraft(), TEST_USER_ID);

      expect(getMockFetch()).toHaveBeenCalledTimes(2);
    });

    it("creates in-app notification after retry exhaustion", async () => {
      const endpoint = makeEndpoint();
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch().mockResolvedValue({ ok: false, status: 500 });

      await dispatchWithFakeTimers(channel, makeDraft(), TEST_USER_ID);

      // Should create a failure notification
      expect(mockNotificationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: TEST_USER_ID,
          type: "module_unreachable",
          message: expect.stringContaining("Webhook delivery failed"),
        }),
      });
    });

    it("populates data.titleKey + 5W+H metadata for late-bound i18n on delivery failure", async () => {
      const endpoint = makeEndpoint({ url: "https://late-bind.example.com/hook" });
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch().mockResolvedValue({ ok: false, status: 500 });

      await dispatchWithFakeTimers(
        channel,
        makeDraft({ type: "vacancy_promoted" }),
        TEST_USER_ID,
      );

      const failureCall = mockNotificationCreate.mock.calls.find((c: unknown[]) => {
        const row = (c[0] as { data: { data?: { titleKey?: string } } }).data;
        return row.data?.titleKey === "webhook.deliveryFailed";
      });
      expect(failureCall).toBeDefined();
      const payload = (failureCall as unknown[])[0] as {
        data: {
          data: Record<string, unknown>;
          message: string;
          titleKey?: string;
          titleParams?: Record<string, unknown>;
          actorType?: string;
          severity?: string;
        };
      };
      // Legacy `data.*` blob — still populated for backward compat during rollout
      expect(payload.data.data).toEqual(
        expect.objectContaining({
          titleKey: "webhook.deliveryFailed",
          titleParams: {
            eventType: "vacancy_promoted",
            url: "https://late-bind.example.com/hook",
          },
          actorType: "system",
          actorNameKey: "notifications.actor.system",
          severity: "error",
          endpointUrl: "https://late-bind.example.com/hook",
          eventType: "vacancy_promoted",
        }),
      );
      // ADR-030: top-level 5W+H columns must also be populated (dual-write)
      expect(payload.data).toEqual(
        expect.objectContaining({
          titleKey: "webhook.deliveryFailed",
          titleParams: {
            eventType: "vacancy_promoted",
            url: "https://late-bind.example.com/hook",
          },
          actorType: "system",
          severity: "error",
        }),
      );
      // Backward-compat locale-resolved message must still be populated
      expect(typeof payload.data.message).toBe("string");
      expect(payload.data.message.length).toBeGreaterThan(0);
    });

    it("uses atomic increment for failureCount after all retries exhausted", async () => {
      const endpoint = makeEndpoint({ failureCount: 2 });
      mockFindMany.mockResolvedValue([endpoint]);
      mockUpdate.mockResolvedValue({ failureCount: 3 });
      getMockFetch().mockResolvedValue({ ok: false, status: 500 });

      await dispatchWithFakeTimers(channel, makeDraft(), TEST_USER_ID);

      // M3: atomic increment instead of read-then-write
      // H3: userId must be in where clause
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "ep-1", userId: TEST_USER_ID },
        data: { failureCount: { increment: 1 } },
        select: { failureCount: true },
      });
    });

    it("has correct backoff intervals: 1s, 5s, 30s", () => {
      expect(_testHelpers.RETRY_BACKOFFS_MS).toEqual([1_000, 5_000, 30_000]);
      expect(_testHelpers.MAX_ATTEMPTS).toBe(3);
    });
  });

  describe("auto-deactivation", () => {
    it("deactivates endpoint after 5 consecutive failures", async () => {
      const endpoint = makeEndpoint({ failureCount: 4 }); // will become 5
      mockFindMany.mockResolvedValue([endpoint]);
      // M3: atomic increment returns the updated failureCount
      mockUpdate.mockResolvedValueOnce({ failureCount: 5 }).mockResolvedValue({});
      getMockFetch().mockResolvedValue({ ok: false, status: 500 });

      await dispatchWithFakeTimers(channel, makeDraft(), TEST_USER_ID);

      // First update: atomic increment (M3 + H3)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "ep-1", userId: TEST_USER_ID },
        data: { failureCount: { increment: 1 } },
        select: { failureCount: true },
      });

      // Second update: deactivate (H3: userId in where)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "ep-1", userId: TEST_USER_ID },
        data: { active: false },
      });
    });

    it("creates deactivation notification when endpoint is deactivated", async () => {
      const endpoint = makeEndpoint({ failureCount: 4 });
      mockFindMany.mockResolvedValue([endpoint]);
      // M3: atomic increment returns failureCount >= threshold
      mockUpdate.mockResolvedValueOnce({ failureCount: 5 }).mockResolvedValue({});
      getMockFetch().mockResolvedValue({ ok: false, status: 500 });

      await dispatchWithFakeTimers(channel, makeDraft(), TEST_USER_ID);

      // Should create both failure and deactivation notifications (M6: i18n messages)
      const calls = mockNotificationCreate.mock.calls;
      const deactivationCall = calls.find(
        (c: unknown[]) =>
          (
            c[0] as { data: { message: string } }
          ).data.message.includes("deactivated due to repeated failures"),
      );
      expect(deactivationCall).toBeDefined();
    });

    it("populates data.titleKey + 5W+H metadata for late-bound i18n on auto-deactivation", async () => {
      const endpoint = makeEndpoint({
        url: "https://late-bind-deact.example.com/hook",
        failureCount: 4,
      });
      mockFindMany.mockResolvedValue([endpoint]);
      mockUpdate.mockResolvedValueOnce({ failureCount: 5 }).mockResolvedValue({});
      getMockFetch().mockResolvedValue({ ok: false, status: 500 });

      await dispatchWithFakeTimers(channel, makeDraft(), TEST_USER_ID);

      const deactivationCall = mockNotificationCreate.mock.calls.find(
        (c: unknown[]) => {
          const row = (
            c[0] as { data: { data?: { titleKey?: string } } }
          ).data;
          return row.data?.titleKey === "webhook.endpointDeactivated";
        },
      );
      expect(deactivationCall).toBeDefined();
      const payload = (deactivationCall as unknown[])[0] as {
        data: {
          data: Record<string, unknown>;
          message: string;
          titleKey?: string;
          titleParams?: Record<string, unknown>;
          actorType?: string;
          severity?: string;
        };
      };
      // Legacy `data.*` blob — still populated for backward compat during rollout
      expect(payload.data.data).toEqual(
        expect.objectContaining({
          titleKey: "webhook.endpointDeactivated",
          titleParams: { url: "https://late-bind-deact.example.com/hook" },
          actorType: "system",
          actorNameKey: "notifications.actor.system",
          severity: "warning",
          endpointUrl: "https://late-bind-deact.example.com/hook",
        }),
      );
      // ADR-030: top-level 5W+H columns must also be populated (dual-write)
      expect(payload.data).toEqual(
        expect.objectContaining({
          titleKey: "webhook.endpointDeactivated",
          titleParams: { url: "https://late-bind-deact.example.com/hook" },
          actorType: "system",
          severity: "warning",
        }),
      );
      expect(typeof payload.data.message).toBe("string");
      expect(payload.data.message.length).toBeGreaterThan(0);
    });

    it("does not deactivate when failureCount is below threshold", async () => {
      const endpoint = makeEndpoint({ failureCount: 2 }); // will become 3, below 5
      mockFindMany.mockResolvedValue([endpoint]);
      // M3: atomic increment returns failureCount below threshold
      mockUpdate.mockResolvedValue({ failureCount: 3 });
      getMockFetch().mockResolvedValue({ ok: false, status: 500 });

      await dispatchWithFakeTimers(channel, makeDraft(), TEST_USER_ID);

      // Should use atomic increment (M3 + H3)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "ep-1", userId: TEST_USER_ID },
        data: { failureCount: { increment: 1 } },
        select: { failureCount: true },
      });

      // Should NOT have a deactivation update
      const deactivateCall = mockUpdate.mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { data: { active?: boolean } }).data.active === false,
      );
      expect(deactivateCall).toBeUndefined();
    });

    it("threshold is 5 consecutive failures", () => {
      expect(_testHelpers.AUTO_DEACTIVATE_THRESHOLD).toBe(5);
    });
  });

  describe("timeout handling", () => {
    it("aborts fetch after 10 seconds", async () => {
      const endpoint = makeEndpoint();
      mockFindMany.mockResolvedValue([endpoint]);

      // Simulate AbortError on all attempts
      getMockFetch().mockRejectedValue(
        new DOMException("The operation was aborted", "AbortError"),
      );

      const result = await dispatchWithFakeTimers(
        channel,
        makeDraft(),
        TEST_USER_ID,
      );

      // Should fail but not throw
      expect(result.channel).toBe("webhook");
    });

    it("timeout is 10 seconds", () => {
      expect(_testHelpers.FETCH_TIMEOUT_MS).toBe(10_000);
    });
  });

  describe("isAvailable", () => {
    it("returns true when user has active endpoints", async () => {
      mockCount.mockResolvedValue(2);

      const result = await channel.isAvailable(TEST_USER_ID);
      expect(result).toBe(true);
      expect(mockCount).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, active: true },
      });
    });

    it("returns false when user has no active endpoints", async () => {
      mockCount.mockResolvedValue(0);

      const result = await channel.isAvailable(TEST_USER_ID);
      expect(result).toBe(false);
    });
  });

  describe("multiple endpoints", () => {
    it("delivers to multiple matching endpoints independently", async () => {
      const ep1 = makeEndpoint({ id: "ep-1", url: "https://a.com/hook" });
      const ep2 = makeEndpoint({ id: "ep-2", url: "https://b.com/hook" });
      mockFindMany.mockResolvedValue([ep1, ep2]);
      getMockFetch().mockResolvedValue({ ok: true, status: 200 });

      const result = await channel.dispatch(makeDraft(), TEST_USER_ID);

      expect(result.success).toBe(true);
      expect(getMockFetch()).toHaveBeenCalledTimes(2);
    });

    it("continues to next endpoint when one fails SSRF", async () => {
      const ep1 = makeEndpoint({ id: "ep-1", url: "http://10.0.0.1/hook" });
      const ep2 = makeEndpoint({
        id: "ep-2",
        url: "https://public.com/hook",
      });
      mockFindMany.mockResolvedValue([ep1, ep2]);

      mockValidateWebhookUrl
        .mockReturnValueOnce({ valid: false, error: "webhook.ssrfBlocked" })
        .mockReturnValueOnce({ valid: true });
      getMockFetch().mockResolvedValue({ ok: true, status: 200 });

      const result = await channel.dispatch(makeDraft(), TEST_USER_ID);

      expect(result.success).toBe(true);
      expect(getMockFetch()).toHaveBeenCalledTimes(1);
    });
  });

  describe("SSRF redirect prevention (H1)", () => {
    it("passes redirect: 'manual' to fetch", async () => {
      const endpoint = makeEndpoint();
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch().mockResolvedValue({ ok: true, status: 200 });

      await channel.dispatch(makeDraft(), TEST_USER_ID);

      const options = getMockFetch().mock.calls[0][1];
      expect(options.redirect).toBe("manual");
    });

    it("treats 301 redirect as failure", async () => {
      const endpoint = makeEndpoint();
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch().mockResolvedValue({ ok: false, status: 301 });

      await dispatchWithFakeTimers(channel, makeDraft(), TEST_USER_ID);

      // Should retry all 3 attempts since redirects are failures
      expect(getMockFetch()).toHaveBeenCalledTimes(3);
    });

    it("treats 302 redirect as failure", async () => {
      const endpoint = makeEndpoint();
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch().mockResolvedValue({ ok: false, status: 302 });

      await dispatchWithFakeTimers(channel, makeDraft(), TEST_USER_ID);

      expect(getMockFetch()).toHaveBeenCalledTimes(3);
    });

    it("treats 307 redirect as failure", async () => {
      const endpoint = makeEndpoint();
      mockFindMany.mockResolvedValue([endpoint]);
      getMockFetch().mockResolvedValue({ ok: false, status: 307 });

      await dispatchWithFakeTimers(channel, makeDraft(), TEST_USER_ID);

      expect(getMockFetch()).toHaveBeenCalledTimes(3);
    });
  });

  describe("concurrent delivery (M2)", () => {
    it("delivers to multiple endpoints concurrently via Promise.allSettled", async () => {
      const callOrder: string[] = [];
      const ep1 = makeEndpoint({ id: "ep-1", url: "https://a.com/hook" });
      const ep2 = makeEndpoint({ id: "ep-2", url: "https://b.com/hook" });
      mockFindMany.mockResolvedValue([ep1, ep2]);

      getMockFetch().mockImplementation((url: string) => {
        callOrder.push(url);
        return Promise.resolve({ ok: true, status: 200 });
      });

      const result = await channel.dispatch(makeDraft(), TEST_USER_ID);

      expect(result.success).toBe(true);
      expect(getMockFetch()).toHaveBeenCalledTimes(2);
      // Both endpoints should have been called
      expect(callOrder).toContain("https://a.com/hook");
      expect(callOrder).toContain("https://b.com/hook");
    });
  });

  describe("error isolation", () => {
    it("returns error result without throwing on Prisma failure", async () => {
      mockFindMany.mockRejectedValue(new Error("DB connection lost"));

      const result = await channel.dispatch(makeDraft(), TEST_USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe("DB connection lost");
    });

    it("handles malformed events JSON gracefully", async () => {
      const endpoint = makeEndpoint({ events: "not-json" });
      mockFindMany.mockResolvedValue([endpoint]);

      const result = await channel.dispatch(makeDraft(), TEST_USER_ID);

      // Endpoint with malformed JSON should be filtered out
      expect(result.success).toBe(true);
      expect(getMockFetch()).not.toHaveBeenCalled();
    });
  });
});
