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
  NotificationChannelId,
} from "@/models/notification.model";
import type { DispatchContext } from "./dispatch-context";
import type { NotificationChannel, NotificationDraft, ChannelResult } from "./types";

export interface ChannelRouterResult {
  /** At least one channel dispatched successfully */
  anySuccess: boolean;
  /** Per-channel results */
  results: ChannelResult[];
}

// ---------------------------------------------------------------------------
// Availability (PERF-3: moved to DispatchContext snapshot flags)
// ---------------------------------------------------------------------------

/**
 * Map from channel name to the DispatchContext boolean flag that indicates
 * availability. Used by `route()` to synchronously check availability from
 * the pre-built snapshot instead of calling `isAvailable()` + cache.
 */
const AVAILABILITY_FLAG: Record<string, keyof DispatchContext> = {
  inApp: "inAppAvailable",
  email: "emailAvailable",
  push: "pushAvailable",
  webhook: "webhookAvailable",
};

export class ChannelRouter {
  private channels: NotificationChannel[] = [];

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
  }

  /**
   * Check if a given channel name is registered.
   */
  has(channelName: string): boolean {
    return this.channels.some((c) => c.name === channelName);
  }

  /**
   * No-op — PERF-3: availability is now derived from DispatchContext snapshot
   * flags, so there is no cache to invalidate. Method signature kept for
   * existing callers (Settings actions, GDPR delete) to avoid a breaking change.
   *
   * @see Roadmap 6.1 — GDPR-Konformität / Löschkonzept
   */
  invalidateAllChannels(_userId: string): void {
    // no-op: availability is snapshot-based since PERF-3
  }

  /**
   * No-op — PERF-3: availability is now derived from DispatchContext snapshot
   * flags built fresh per dispatch. The `isAvailable()` cache has been
   * removed. Method signature kept for existing callers (Settings actions,
   * PushChannel stale-subscription cleanup) to avoid a breaking change.
   */
  invalidateAvailability(_userId?: string, _channelName?: string): void {
    // no-op: availability is snapshot-based since PERF-3
  }

  /**
   * Route a notification draft to all enabled channels for the given user.
   *
   * PERF-3: receives the pre-built DispatchContext instead of bare
   * NotificationPreferences. Availability is checked synchronously from
   * the snapshot flags — no DB round-trips, no cache.
   *
   * Phase 1: Synchronous preference gating (fast, no I/O)
   * Phase 2: Synchronous availability check + concurrent dispatch
   * Phase 3: Collect results from settled promises
   *
   * @param draft - The notification to dispatch
   * @param ctx   - Pre-built DispatchContext with all per-user data
   */
  async route(draft: NotificationDraft, ctx: DispatchContext): Promise<ChannelRouterResult> {
    // Phase 1: Synchronous preference gating (fast, no I/O)
    const eligibleChannels = this.channels.filter((channel) => {
      const channelId = channel.name as NotificationChannelId;
      return shouldNotify(ctx.preferences, draft.type, channelId);
    });

    // Phase 2: Synchronous availability check + concurrent dispatch
    const settled = await Promise.allSettled(
      eligibleChannels.map(async (channel) => {
        // Check availability from snapshot flag (synchronous, no DB)
        const flagKey = AVAILABILITY_FLAG[channel.name];
        if (flagKey && !ctx[flagKey]) return null;
        return channel.dispatch(draft, ctx);
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
