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

import prisma from "@/lib/db";
import {
  shouldNotify,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@/models/notification.model";
import type {
  NotificationPreferences,
  NotificationChannelId,
  NotificationType,
  NotificationDataExtended,
  NotificationSeverity,
  NotificationActorType,
} from "@/models/notification.model";
import type { UserSettingsData } from "@/models/userSettings.model";
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
// Enforced notification preference gate (Sprint 2 H-A-04 + H-A-07)
// ---------------------------------------------------------------------------

/**
 * Resolve a user's notification preferences from UserSettings.
 * Returns DEFAULT_NOTIFICATION_PREFERENCES on any error (fail-open) — this
 * preserves the historical behaviour that a misconfigured/absent UserSettings
 * row never suppresses operational notifications.
 */
async function resolvePreferencesForEnforcer(
  userId: string,
): Promise<NotificationPreferences> {
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return DEFAULT_NOTIFICATION_PREFERENCES;
    const parsed: UserSettingsData = JSON.parse(row.settings);
    return parsed.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES;
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

/**
 * Structured draft handed to the direct-writer gate. Mirrors the subset of
 * the Prisma `NotificationCreateInput` shape that the 5 legacy direct-writer
 * sites (degradation.ts ×3, webhook.channel.ts ×2) actually populate.
 *
 * Spec (ADR-030 / specs/notification-dispatch.allium invariant
 * SingleNotificationWriter): every row produced by this draft carries the
 * structured 5W+H metadata (titleKey/titleParams/actorType/actorId/reasonKey/
 * severity) as top-level columns AND dual-written into `data.*` for
 * backward compat.
 */
export interface EnforcedNotificationDraft {
  userId: string;
  type: NotificationType;
  /** English fallback message — still required for email/webhook/push/legacy readers. */
  message: string;
  moduleId?: string | null;
  automationId?: string | null;
  /**
   * Structured 5W+H metadata. The gate helper will dual-write this into the
   * top-level Prisma columns AND the legacy `data` JSON blob.
   */
  titleKey: string;
  titleParams?: Record<string, string | number>;
  actorType: NotificationActorType;
  actorId?: string | null;
  reasonKey?: string;
  reasonParams?: Record<string, string | number>;
  severity: NotificationSeverity;
  /**
   * Additional contextual ids (e.g. endpointUrl, failureCount, moduleName,
   * automationName, stagedVacancyId, jobId) that should be merged into the
   * `data` JSON blob alongside the structured fields.
   */
  extraData?: Record<string, unknown>;
}

/**
 * The prepared Prisma `NotificationCreateInput.data` payload that the caller
 * should pass to `prisma.notification.create({ data })`. Kept as a plain
 * object so that the physical write stays at the legacy call site (which is
 * on the `scripts/check-notification-writers.sh` allowlist) while the gate
 * logic is centralized here.
 */
export interface PreparedNotificationRow {
  userId: string;
  type: NotificationType;
  message: string;
  moduleId?: string;
  automationId?: string;
  data: object;
  titleKey: string;
  titleParams?: object;
  actorType: NotificationActorType;
  actorId?: string;
  reasonKey?: string;
  reasonParams?: object;
  severity: NotificationSeverity;
}

/**
 * Result of gating + preparing a direct-writer draft. Exactly one of
 * `suppressed` or `row` is populated.
 */
export type PrepareNotificationResult =
  | { suppressed: true; row?: undefined }
  | { suppressed: false; row: PreparedNotificationRow };

/**
 * Build a Prisma-ready notification row IF and ONLY IF `shouldNotify()`
 * allows the write for this user.
 *
 * This is the core of the Sprint 2 H-A-04 + H-A-07 fix (`specs/notification-
 * dispatch.allium` invariants `QuietHoursRespected` and `SingleNotification-
 * Writer`). The 5 historical direct-writer sites (degradation.ts ×3,
 * webhook.channel.ts ×2) used to call `prisma.notification.create*` directly,
 * completely bypassing `shouldNotify()`: no global kill switch, no perType
 * check, no quiet hours, no channel gate. Any user who had in-app
 * notifications disabled would still receive persistent rows from those
 * code paths.
 *
 * This helper centralizes the gate without moving the physical Prisma write.
 * The 5 call sites stay on the `scripts/check-notification-writers.sh`
 * allowlist (where they have always been). Each call site now:
 *
 *   1. Builds an `EnforcedNotificationDraft` describing the row it wants.
 *   2. Calls `prepareEnforcedNotification(draft, prefs?)`.
 *   3. If `{ suppressed: true }` — skips the write entirely.
 *   4. Otherwise — passes `result.row` directly to
 *      `prisma.notification.create({ data: result.row })`.
 *
 * The helper dual-writes the 5W+H metadata into both the top-level Prisma
 * columns AND the legacy `data` blob (ADR-030 Decision B — late-binding).
 *
 * @param draft  Structured draft (incl. top-level 5W+H columns).
 * @param prefs  Optional pre-resolved preferences (avoids an extra
 *               userSettings.findUnique when the caller already has them
 *               — e.g., when writing multiple notifications in a loop per
 *               createMany batch).
 */
export async function prepareEnforcedNotification(
  draft: EnforcedNotificationDraft,
  prefs?: NotificationPreferences,
): Promise<PrepareNotificationResult> {
  const resolvedPrefs =
    prefs ?? (await resolvePreferencesForEnforcer(draft.userId));

  // Gate through the same preference helper the ChannelRouter uses.
  // The 5 legacy direct-writer sites are all in-app writes, so the channel
  // id is always "inApp". This is the QuietHoursRespected enforcement point.
  if (!shouldNotify(resolvedPrefs, draft.type, "inApp")) {
    return { suppressed: true };
  }

  // Dual-write the 5W+H structured metadata into both the top-level columns
  // AND the legacy `data` blob (ADR-030 Decision B).
  const extendedData: NotificationDataExtended = {
    ...(draft.extraData ?? {}),
    titleKey: draft.titleKey,
    ...(draft.titleParams !== undefined ? { titleParams: draft.titleParams } : {}),
    actorType: draft.actorType,
    ...(draft.actorId !== undefined && draft.actorId !== null
      ? { actorId: draft.actorId }
      : {}),
    ...(draft.reasonKey !== undefined ? { reasonKey: draft.reasonKey } : {}),
    ...(draft.reasonParams !== undefined ? { reasonParams: draft.reasonParams } : {}),
    severity: draft.severity,
  };

  const row: PreparedNotificationRow = {
    userId: draft.userId,
    type: draft.type,
    message: draft.message,
    ...(draft.moduleId !== undefined && draft.moduleId !== null
      ? { moduleId: draft.moduleId }
      : {}),
    ...(draft.automationId !== undefined && draft.automationId !== null
      ? { automationId: draft.automationId }
      : {}),
    data: extendedData as object,
    // Top-level 5W+H columns (ADR-030)
    titleKey: draft.titleKey,
    ...(draft.titleParams !== undefined
      ? { titleParams: draft.titleParams as object }
      : {}),
    actorType: draft.actorType,
    ...(draft.actorId !== undefined && draft.actorId !== null
      ? { actorId: draft.actorId }
      : {}),
    ...(draft.reasonKey !== undefined ? { reasonKey: draft.reasonKey } : {}),
    ...(draft.reasonParams !== undefined
      ? { reasonParams: draft.reasonParams as object }
      : {}),
    severity: draft.severity,
  };

  return { suppressed: false, row };
}

/**
 * Batched variant — gates N drafts and returns only the rows that passed
 * the preference gate. The caller writes the surviving rows via a single
 * `prisma.notification.createMany({ data: rows })` call at the legacy call
 * site.
 *
 * The `shouldNotify` gate is applied PER user: each draft's userId is
 * resolved independently and its preferences gate its own row. Rows that
 * fail the gate are silently suppressed while the remaining rows pass
 * through.
 *
 * A map of pre-resolved preferences by userId can be passed in to avoid N
 * `userSettings.findUnique` reads when the caller already knows all user
 * ids up front.
 */
export async function prepareEnforcedNotifications(
  drafts: EnforcedNotificationDraft[],
  prefsByUser?: Map<string, NotificationPreferences>,
): Promise<{
  rows: PreparedNotificationRow[];
  suppressed: number;
}> {
  if (drafts.length === 0) {
    return { rows: [], suppressed: 0 };
  }

  // Resolve preferences once per distinct userId if the caller did not
  // provide a pre-built map.
  const resolved = prefsByUser ?? new Map<string, NotificationPreferences>();
  if (!prefsByUser) {
    const uniqueUserIds = Array.from(new Set(drafts.map((d) => d.userId)));
    await Promise.all(
      uniqueUserIds.map(async (uid) => {
        resolved.set(uid, await resolvePreferencesForEnforcer(uid));
      }),
    );
  }

  const rows: PreparedNotificationRow[] = [];
  let suppressed = 0;

  for (const draft of drafts) {
    const result = await prepareEnforcedNotification(
      draft,
      resolved.get(draft.userId),
    );
    if (result.suppressed) {
      suppressed += 1;
    } else {
      rows.push(result.row);
    }
  }

  return { rows, suppressed };
}

/**
 * @internal Test-only accessor for the internal preferences resolver used by
 * the enforced writer. Exposed so unit tests can assert the fail-open branch
 * without reaching into the module internals via rewire.
 */
export const _enforcedWriterInternals = {
  resolvePreferencesForEnforcer,
};
