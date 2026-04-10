/**
 * ChannelRouter — Multi-Channel Notification Dispatcher
 *
 * Receives NotificationDrafts and routes them to all enabled channels.
 * Replaces the hardcoded in-app logic in notification-dispatcher.ts.
 *
 * Design:
 * 1. Resolves user preferences (once per dispatch)
 * 2. For each registered channel:
 *    a. Checks if channel is enabled in preferences (shouldNotify per channel)
 *    b. Checks if channel infrastructure is available (isAvailable)
 *    c. Dispatches with error isolation (one channel failure doesn't block others)
 * 3. Returns aggregated results
 *
 * Extensibility: D2 (Email) and D3 (Push) add their channel implementations
 * and register them — no changes to this router needed.
 *
 * Spec: specs/notification-dispatch.allium
 */

import "server-only";

import { shouldNotify } from "@/models/notification.model";
import type {
  NotificationPreferences,
  NotificationChannelId,
} from "@/models/notification.model";
import type { NotificationChannel, NotificationDraft, ChannelResult } from "./types";

export interface ChannelRouterResult {
  /** At least one channel dispatched successfully */
  anySuccess: boolean;
  /** Per-channel results */
  results: ChannelResult[];
}

// ---------------------------------------------------------------------------
// isAvailable cache (Sprint 3 M-P-01 + M-P-SPEC-02)
// ---------------------------------------------------------------------------

/**
 * Default TTL for the `isAvailable` cache. Channel availability is a "slow
 * signal" — a user who just enabled email dispatch keeps their SmtpConfig row
 * until they delete it. 30 seconds is short enough to pick up Settings
 * changes within one dispatch cycle of a burst, and long enough to amortize
 * the DB round-trip over ~30s of event storm (retention sweeps, bulk actions).
 */
export const ISAVAILABLE_CACHE_TTL_MS = 30_000;

interface AvailabilityCacheEntry {
  /** Whether the channel was available at the time of the cached check */
  available: boolean;
  /** Monotonic timestamp (performance-independent, we use Date.now) */
  at: number;
}

/**
 * Cache key is `${userId}:${channelName}` — one slot per user per channel.
 * Exported for `invalidateAvailability()` and tests.
 */
export type AvailabilityCacheKey = string;

function makeAvailabilityCacheKey(userId: string, channelName: string): AvailabilityCacheKey {
  return `${userId}:${channelName}`;
}

export class ChannelRouter {
  private channels: NotificationChannel[] = [];

  /**
   * Per-user per-channel cache for `isAvailable()` results.
   *
   * M-P-01 + M-P-SPEC-02 motivation: every notification dispatch iterates
   * enabled channels and calls `channel.isAvailable(userId)`. Each channel
   * implementation runs a separate Prisma query (`webhookEndpoint.count`,
   * `smtpConfig.count`, `vapidConfig.findUnique` + `webPushSubscription.count`).
   * A user who enabled webhook + email + push with no actual endpoints still
   * pays 4 DB round-trips per notification forever. Under event-storm load
   * (retention sweeps, bulk actions over 500 items) the round-trips compete
   * for the shared SQLite writer lock.
   *
   * This cache is a best-effort per-instance layer — it deliberately does
   * NOT cross process boundaries (no Redis, no globalThis sharing). The TTL
   * is short enough that Settings updates propagate within one dispatch cycle
   * of a burst, and `invalidateAvailability(userId)` gives the Settings UI a
   * synchronous invalidation hook when the user changes channel config.
   */
  private availabilityCache = new Map<AvailabilityCacheKey, AvailabilityCacheEntry>();

  /** TTL in ms — overridable for tests, defaults to ISAVAILABLE_CACHE_TTL_MS */
  private readonly availabilityTtlMs: number;

  constructor(options: { availabilityTtlMs?: number } = {}) {
    this.availabilityTtlMs = options.availabilityTtlMs ?? ISAVAILABLE_CACHE_TTL_MS;
  }

  /**
   * Register a notification channel. Channels are dispatched in registration order.
   */
  register(channel: NotificationChannel): void {
    // Prevent duplicate registration
    if (this.channels.some((c) => c.name === channel.name)) {
      console.warn(`[ChannelRouter] Channel "${channel.name}" already registered, skipping`);
      return;
    }
    this.channels.push(channel);
  }

  /**
   * Unregister all channels. Test-only utility so suites that want to inject
   * their own mock channels against the production singleton can do so
   * without leaking state across tests.
   *
   * @internal test helper
   */
  clear(): void {
    this.channels.length = 0;
    this.availabilityCache.clear();
  }

  /**
   * Check if a given channel name is registered.
   */
  has(channelName: string): boolean {
    return this.channels.some((c) => c.name === channelName);
  }

  /**
   * Invalidate cached `isAvailable` results. When called with no arguments,
   * the entire cache is dropped — use this sparingly (tests, admin tools).
   * When called with a `userId` + optional channel name, drops only the
   * matching entries — this is the hook the Settings UI calls after the user
   * updates channel configuration so the next dispatch sees fresh state.
   *
   * Callers: `src/actions/webhook.actions.ts`, `src/actions/smtp.actions.ts`,
   * `src/actions/push.actions.ts` after any CRUD that mutates channel infra.
   */
  invalidateAvailability(userId?: string, channelName?: string): void {
    if (!userId) {
      this.availabilityCache.clear();
      return;
    }
    if (channelName) {
      this.availabilityCache.delete(makeAvailabilityCacheKey(userId, channelName));
      return;
    }
    // Invalidate all channels for the given user. O(n) over entries but the
    // map is tiny (users_active × channels_registered ≤ a few hundred in
    // practice).
    const prefix = `${userId}:`;
    for (const key of this.availabilityCache.keys()) {
      if (key.startsWith(prefix)) {
        this.availabilityCache.delete(key);
      }
    }
  }

  /**
   * Check `isAvailable` with cache. Returns the cached value on hit and
   * populates the cache on miss. The cache only records the boolean result —
   * errors from the underlying `isAvailable()` call propagate so the router's
   * per-channel error isolation can still surface them as `ChannelResult`.
   */
  private async checkAvailabilityCached(
    channel: NotificationChannel,
    userId: string,
  ): Promise<boolean> {
    const key = makeAvailabilityCacheKey(userId, channel.name);
    const now = Date.now();
    const cached = this.availabilityCache.get(key);
    if (cached && now - cached.at < this.availabilityTtlMs) {
      return cached.available;
    }
    // Cache miss — delegate to the channel and record the result. An error
    // thrown here is not cached: we want the next dispatch to retry instead
    // of sticking on a transient false (e.g. DB blip).
    const available = await channel.isAvailable(userId);
    this.availabilityCache.set(key, { available, at: now });
    return available;
  }

  /**
   * Route a notification draft to all enabled channels for the given user.
   *
   * Phase 1: Synchronous preference gating (fast, no I/O)
   * Phase 2: Concurrent availability check + dispatch (Promise.allSettled)
   *          — cached per (userId, channel) with TTL so repeat dispatches
   *            within the same cache window skip the DB round-trip entirely.
   * Phase 3: Collect results from settled promises
   *
   * @param draft - The notification to dispatch
   * @param prefs - Resolved user preferences (caller resolves once)
   */
  async route(draft: NotificationDraft, prefs: NotificationPreferences): Promise<ChannelRouterResult> {
    // Phase 1: Synchronous preference gating (fast, no I/O)
    const eligibleChannels = this.channels.filter((channel) => {
      const channelId = channel.name as NotificationChannelId;
      return shouldNotify(prefs, draft.type, channelId);
    });

    // Phase 2: Concurrent availability check (cached) + dispatch
    const settled = await Promise.allSettled(
      eligibleChannels.map(async (channel) => {
        const available = await this.checkAvailabilityCached(channel, draft.userId);
        if (!available) return null;
        return channel.dispatch(draft, draft.userId);
      }),
    );

    // Phase 3: Collect results
    const results: ChannelResult[] = [];
    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      if (outcome.status === "fulfilled") {
        if (outcome.value !== null) {
          results.push(outcome.value);
        }
      } else {
        const channel = eligibleChannels[i];
        const errorMessage = outcome.reason instanceof Error ? outcome.reason.message : "Unknown error";
        console.error(`[ChannelRouter] Channel "${channel.name}" threw:`, outcome.reason);
        results.push({ success: false, channel: channel.name, error: errorMessage });
      }
    }

    return {
      anySuccess: results.some((r) => r.success),
      results,
    };
  }

  /**
   * Get the number of registered channels (for testing).
   */
  get channelCount(): number {
    return this.channels.length;
  }

  /**
   * Get registered channel names (for testing/debugging).
   */
  get channelNames(): string[] {
    return this.channels.map((c) => c.name);
  }
}

// ---------------------------------------------------------------------------
// Singleton — survives HMR via globalThis
// ---------------------------------------------------------------------------

const g = globalThis as unknown as {
  __channelRouter?: ChannelRouter;
  __channelRouterRegistered?: boolean;
};
if (!g.__channelRouter) {
  g.__channelRouter = new ChannelRouter();
}
export const channelRouter = g.__channelRouter;

// Production channels are imported statically so Jest can resolve their
// mocks deterministically. The instantiation + registration happens inside
// `registerChannels()` below, NOT at module-import time — that is the
// anti-pattern M-A-05 removes.
import { InAppChannel } from "./channels/in-app.channel";
import { WebhookChannel } from "./channels/webhook.channel";
import { EmailChannel } from "./channels/email.channel";
import { PushChannel } from "./channels/push.channel";

/**
 * Explicitly register the production notification channels on the singleton
 * ChannelRouter. Called from `registerNotificationDispatcher()` during the
 * `registerEventConsumers()` boot sequence (see
 * `src/lib/events/consumers/index.ts`) — never run as a module-import side
 * effect.
 *
 * Sprint 3 M-A-05 motivation: channel registration used to happen as four
 * top-level `channelRouter.register(new XChannel())` calls at the bottom of
 * `notification-dispatcher.ts`. Any code that imported the dispatcher for
 * types, test helpers, or the `registerNotificationDispatcher` function
 * incurred channel registration at import time — even in test environments
 * where tests wanted to substitute mock channels. Registration order
 * depended on module import order, which is fragile under HMR and test
 * runtime reloads.
 *
 * This helper centralises the registration into a single well-known init
 * point. The `globalThis.__channelRouterRegistered` guard mirrors the
 * `__eventConsumersRegistered` pattern in `consumers/index.ts` so the
 * registration is safe to call multiple times (HMR, duplicate boot) — the
 * underlying `router.register()` also guards against duplicate names with
 * a warning, so the two layers are defense-in-depth.
 *
 * Tests that want to substitute mock channels should call
 * `channelRouter.clear()` + `_resetChannelRegistrationForTesting()` before
 * calling `registerNotificationDispatcher()` (which calls this internally),
 * OR bypass the singleton entirely by constructing a fresh `new
 * ChannelRouter()` per test — the latter is the pattern in
 * `__tests__/channel-router.spec.ts`.
 */
export function registerChannels(): void {
  if (g.__channelRouterRegistered) return;
  g.__channelRouterRegistered = true;

  channelRouter.register(new InAppChannel());
  channelRouter.register(new WebhookChannel());
  channelRouter.register(new EmailChannel());
  channelRouter.register(new PushChannel());
}

/**
 * Test-only reset for the `__channelRouterRegistered` guard. Production
 * code MUST NOT call this — it is exposed so test suites that mount the
 * dispatcher multiple times can force re-registration when they substitute
 * mock channels.
 *
 * @internal
 */
export function _resetChannelRegistrationForTesting(): void {
  g.__channelRouterRegistered = false;
}

// ---------------------------------------------------------------------------
// Enforced notification preference gate
// ---------------------------------------------------------------------------
//
// Sprint 4 L-A: the `prepareEnforcedNotification*` helpers, their draft/
// result types, and the internal `resolvePreferencesForEnforcer` helper
// used to live here but were extracted into `./enforced-writer.ts` to break
// a cyclic import path:
//
//     channel-router.ts ── imports ──▶ channels/webhook.channel.ts
//                                              │
//                                              └── imports prepareEnforcedNotification
//                                                  ▶ channel-router.ts
//
// Both modules now depend on the leaf `enforced-writer.ts` module, which
// depends on neither. See `./enforced-writer.ts` for the implementation and
// the ADR-030 / Sprint 2 H-A-04 + H-A-07 rationale.
//
// Consumers MUST import the helpers directly from `@/lib/notifications/
// enforced-writer` — this file no longer re-exports them.
