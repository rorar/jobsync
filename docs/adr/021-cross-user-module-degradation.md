# ADR-021: Cross-User Module Degradation

**Date:** 2026-04-02
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

The Module Lifecycle Manager (Roadmap 0.4) includes a degradation system that pauses automations when a module's external service becomes unavailable. Three escalation rules exist in `src/lib/connector/degradation.ts`:

1. **`handleAuthFailure()`** -- immediate pause on 401/403 authentication errors
2. **`handleCircuitBreakerTrip()`** -- pause after 3 circuit breaker opens
3. **`checkConsecutiveRunFailures()`** -- pause after 5 consecutive failed runs for a single automation

The design question: when a module-level failure occurs (auth failure or circuit breaker trip), should only the triggering user's automations be paused, or all users' automations using that module?

## Decision

Module-level failures affect **ALL users' automations** using that module. Per-automation failures are scoped to the **individual automation**.

### Module-Level Degradation (Cross-User)

`handleAuthFailure()` and `handleCircuitBreakerTrip()` query automations without userId scope:

```ts
const affectedAutomations = await prisma.automation.findMany({
  where: {
    jobBoard: moduleId,
    status: "active",
  },
  select: { id: true, userId: true, name: true },
});
```

All active automations using the affected module are paused, regardless of which user owns them.

### Automation-Level Degradation (Per-Automation)

`checkConsecutiveRunFailures()` is correctly scoped to the individual automation:

```ts
const recentRuns = await prisma.automationRun.findMany({
  where: { automationId },
  orderBy: { startedAt: "desc" },
  take: 5,
});
```

Consecutive failures are an automation-level pattern (bad search parameters, edge-case data), not a module-level signal.

### Notifications Are Per-User

Although degradation is cross-user, notifications are created per-user using `prisma.notification.createMany()` with each affected automation's `userId`. Each user sees only their own automation pause notifications.

### Rationale

- **Module failures are about the external service, not individual users.** If JSearch's API key is invalid, it is invalid for every automation using JSearch. Pausing only the triggering user's automations would leave other users' automations running against a known-broken service, wasting API quota and generating noise.
- **Current deployment model is single-user.** JobSync is self-hosted; in practice, only one user exists. The cross-user scope is a correctness decision for the architecture, not a current operational concern.
- **Modules have one shared API key, not per-user keys.** The credential resolution system (`src/lib/connector/credential-resolver.ts`) resolves a single credential per module from DB, environment variable, or default. There is no per-user credential override. A module auth failure genuinely means all users are affected.

### Alternatives Considered

- **User-scoped degradation (pause only the triggering user's automations):** Rejected -- misleading for shared-credential modules. If the API key is invalid, other users' automations would continue to fail and accumulate error runs until they independently trigger degradation, creating unnecessary load on the external service.
- **Hybrid approach (module-level for auth, user-level for consecutive failures):** This is the current design -- `handleAuthFailure` and `handleCircuitBreakerTrip` are module-scoped, while `checkConsecutiveRunFailures` is automation-scoped. No change needed.

## Consequences

### Positive
- A single auth failure immediately stops all automations from hitting a broken service, preventing cascading errors and wasted API quota
- Notifications are per-user, so each user is informed about their own affected automations
- The automation-level `checkConsecutiveRunFailures` correctly handles cases where one automation has bad parameters without affecting others on the same module

### Negative
- In a hypothetical multi-user deployment, one user's bad credential could pause all users' automations (but this is correct given the shared-credential model)
- No self-healing: paused automations require manual reactivation even after the module recovers. This is by design (see `specs/module-lifecycle.allium`) to prevent flapping.

### Risks
- **Multi-tenant with per-user API keys:** If the credential model ever changes to support per-user API keys for the same module, the degradation system MUST be refactored to scope `handleAuthFailure()` to the user whose credential failed. The current `findMany({ where: { jobBoard: moduleId } })` query would need a `userId` filter. This is documented in CLAUDE.md under "Connector & Module Lifecycle Rules".
- **False positives from transient errors:** A single 401 response (e.g., due to a temporary API gateway issue) triggers immediate module-wide degradation. The spec requires `credential.required = true` as a precondition, which limits scope, but legitimate transient 401s from external services could cause unnecessary pauses.
