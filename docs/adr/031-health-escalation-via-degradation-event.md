# ADR-031: Health Escalation via AutomationDegraded Event Reuse

## Status

Accepted (2026-05-16)

## Context

The module-lifecycle spec defines `HealthStatusEscalation` — when a module's health status transitions to UNREACHABLE, affected users should be notified. The notification infrastructure for module degradation already exists:

- `AutomationDegraded` domain event with typed `reason` discriminant
- `notification-dispatcher.ts` handler mapping reasons to notification types
- Full multi-channel dispatch (in-app, webhook, email, push)
- Per-automation fan-out with user-scoped notifications
- i18n keys, email templates, deep-links for `module_unreachable`

The question: should health escalation use the existing `AutomationDegraded` event or introduce a new `ModuleHealthUnreachable` event type?

## Decision

Reuse the `AutomationDegraded` event with a new `reason: "health_unreachable"` variant.

The `DEGRADATION_REASON_TO_TYPE` mapping in `notification-dispatcher.ts` uses `Record<AutomationDegradedPayload["reason"], NotificationType>` which enforces compile-time exhaustiveness — adding a new reason without mapping it is a type error.

## Consequences

### Positive

- Zero new event infrastructure (no new type, schema, consumer registration)
- Compile-time safety via exhaustive Record type
- Health escalation automatically gets all existing channels (email, push, webhook)
- Single dispatch pattern for all module-level degradation scenarios
- Notification deep-links, preferences, and quiet-hours all inherited

### Negative

- `AutomationDegraded` event conflates operational failures (auth, CB, run failures) with observability signals (health unreachable). Semantic difference: auth/CB/run failures PAUSE automations, health unreachable is NOTIFICATION-ONLY.
- The `handleAutomationDegraded` consumer in `notification-dispatcher.ts` must handle both pausing (from degradation.ts) and non-pausing (from health-monitor.ts) producers via the same event type.

### Mitigations

- The `reason` field clearly discriminates the source
- Health monitor does NOT call `handleAuthFailure` or pause automations — it only emits the event
- The `@guidance` in `module-lifecycle.allium` explicitly documents this is notification-only
- Transition guard prevents re-firing on every failed health check (only fires on DEGRADED→UNREACHABLE transition)

## Alternatives Considered

1. **New `ModuleHealthUnreachable` event type** — rejected because it would require a new consumer registration, new Zod schema, new handler in notification-dispatcher, all duplicating existing infrastructure.
2. **Direct notification creation in health-monitor** — rejected because it would bypass the channel router and violate the `SingleNotificationWriter` contract invariant.
