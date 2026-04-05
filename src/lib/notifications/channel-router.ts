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
import type { NotificationPreferences, NotificationChannelId } from "@/models/notification.model";
import type { NotificationChannel, NotificationDraft, ChannelResult } from "./types";

export interface ChannelRouterResult {
  /** At least one channel dispatched successfully */
  anySuccess: boolean;
  /** Per-channel results */
  results: ChannelResult[];
}

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
   * Route a notification draft to all enabled channels for the given user.
   *
   * Phase 1: Synchronous preference gating (fast, no I/O)
   * Phase 2: Concurrent availability check + dispatch (Promise.allSettled)
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

    // Phase 2: Concurrent availability check + dispatch
    const settled = await Promise.allSettled(
      eligibleChannels.map(async (channel) => {
        const available = await channel.isAvailable(draft.userId);
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

const g = globalThis as unknown as { __channelRouter?: ChannelRouter };
if (!g.__channelRouter) {
  g.__channelRouter = new ChannelRouter();
}
export const channelRouter = g.__channelRouter;
