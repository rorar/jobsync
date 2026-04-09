# Blind-Spot Analysis — Post-Honesty-Gate Sprint

**Date:** 2026-04-09
**Agent:** analyzer-h-blindspot (Explore, read-only)

## Summary

7 patterns checked. **3 active** (5 findings), **4 clear**.

| # | Pattern | Severity | Findings | Status |
|---|---------|----------|----------|--------|
| 1 | Action routing bypass | LOW | 0 | ✓ CLEAR |
| 2 | Duplicate writers (Notification) | **CRITICAL** | 5 | ACTIVE |
| 3 | Late-bound i18n | MEDIUM | 5 | ACTIVE (same root as #2) |
| 4 | Singleton missing globalThis | MEDIUM | 0 | ✓ CLEAR |
| 5 | Nested interactive a11y | LOW | 0 | ✓ CLEAR |
| 6 | `as any` in components | LOW | 0 | ✓ CLEAR |
| 7 | Silent fallback | MEDIUM | 2 | ACTIVE (low risk) |

## Pattern 2 findings (5 duplicate Notification writers)

All bypass `ChannelRouter` dispatcher + eager-bind i18n strings:

### Already in Stream C scope (3)
- `src/lib/connector/degradation.ts:83` — `handleAuthFailure()` createMany
- `src/lib/connector/degradation.ts:170` — `checkConsecutiveRunFailures()` create
- `src/lib/connector/degradation.ts:252` — `handleCircuitBreakerTrip()` createMany

### NEW findings (2) — out of Stream C's original scope
- `src/lib/notifications/channels/webhook.channel.ts:166` — `notifyDeliveryFailed()` direct create
- `src/lib/notifications/channels/webhook.channel.ts:190` — `notifyEndpointDeactivated()` direct create

These 2 are self-notifications for webhook delivery failures. Same fix pattern as degradation.ts.

## Pattern 7 findings (2 silent fallbacks)

### LOW risk — already verified
- `src/components/staging/StagingContainer.tsx:286` — `createdJobId: result.data?.jobId` — shape verified in honesty gate #18. Optional chain is defensively correct. **Enhancement only:** add a `console.warn` if jobId is ever undefined on success (signals shape drift).

### LOW risk — defer
- `src/lib/locale.ts:28,38,54` — bare `catch {}` blocks in locale parsing. Fallback to default is safe (locale is cosmetic). Enhancement: add `console.debug` to aid diagnostics.

## Recommended follow-ups

1. **Expand Stream C scope** to include the 2 webhook.channel.ts writers (same fix pattern)
2. **Add `console.warn` guard** to StagingContainer.tsx:286 (5-minute fix)
3. **Defer locale.ts** — log enhancement, not a fix
4. **ESLint rules** for future prevention:
   - `no-empty-catch` (or `allowEmptyCatch: false` in existing rule)
   - Forbid direct `prisma.notification.create()` outside `src/lib/notifications/channels/in-app.channel.ts` (the only legitimate writer)

## Patterns that are CLEAR — worth celebrating

- **Pattern 1** (action routing): No components import server actions directly when a coordinator hook exists. The hotfix we just shipped was the only offender and it's now fixed.
- **Pattern 4** (singletons): Last sprint's 5 globalThis fixes are still in place. No new module-level singletons slipped in.
- **Pattern 5** (nested interactive): NotificationItem's `role="article"` refactor removed the last known offender.
- **Pattern 6** (`as any`): Zero `as any` in `src/components/**/*.tsx`. The DiscoveredJob type fix from earlier this session stuck.
