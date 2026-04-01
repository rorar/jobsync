# ADR-015: IDOR Ownership Enforcement Pattern

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

A security audit identified 10+ server actions that queried resources by ID only, without verifying ownership via `userId`. This meant any authenticated user could read or modify another user's data by guessing or enumerating resource IDs. Affected actions included `getJobDetails`, `updateJob`, `getResumeById`, `getCompanyById`, and six resume sub-resource queries (`ContactInfo`, `WorkExperience`, `Education`, `ResumeSection`, etc.).

This is a classic Insecure Direct Object Reference (IDOR) vulnerability. Since JobSync is self-hosted and often single-user, the risk was latent -- but multi-user deployments or any future SaaS mode would be immediately exploitable.

## Decision

All Prisma read and write queries MUST include ownership verification in the `where` clause. Two patterns are established depending on the data model's relationship to the user:

### Pattern 1: Direct Ownership

For models that have a direct `userId` foreign key (`Job`, `Company`, `Profile`):

```ts
prisma.job.findFirst({
  where: { id: resourceId, userId: user.id }
})
```

### Pattern 2: Chain Traversal

For sub-resources that reach the user through a chain of relations (`ContactInfo`, `WorkExperience`, `Education`, `ResumeSection`):

```ts
prisma.contactInfo.findFirst({
  where: { id: resourceId, resume: { profile: { userId: user.id } } }
})
```

### Key Rules

1. **Client-submitted `userId` is NEVER trusted** for authorization. Only the session-authenticated `user.id` (from `getCurrentUser()`) may be used in ownership checks.
2. **`findFirst` replaces `findUnique`** when `userId` is added to the where clause, because Prisma requires `findUnique` where clauses to use only unique index fields. Adding `userId` alongside `id` violates this constraint.
3. The pattern is documented in `specs/security-rules.allium` as the authoritative specification for future contributors and agents.

### Alternatives Considered

- **Middleware-level enforcement**: Rejected -- Prisma middleware cannot reliably determine the current user without `AsyncLocalStorage`, which is not yet adopted (planned for Public API Phase 2).
- **Row-Level Security in SQLite**: Not supported by SQLite.
- **Post-query ownership check**: Rejected -- still fetches unauthorized data into memory, violates defense-in-depth.

## Consequences

### Positive
- Eliminates an entire class of IDOR vulnerabilities across all server actions
- Ownership is enforced at the query level, not application logic -- cannot be accidentally bypassed
- Pattern is simple and auditable: grep for `findFirst` + `userId` to verify compliance
- Chain traversal pattern works for arbitrarily deep ownership relationships

### Negative
- `findFirst` is marginally slower than `findUnique` due to lacking the unique-index optimization
- Sub-resource mutations require an extra pre-flight query to verify ownership through the relation chain
- Developers must remember to include ownership in every new query -- no compile-time enforcement

### Risks
- New server actions could omit the ownership check if contributors are unaware of this ADR
- The chain traversal pattern adds query complexity that could become a performance concern with deeply nested models
- `findFirst` returns `null` for both "not found" and "not owned", making debugging slightly harder (but this is intentional -- never reveal whether a resource exists to unauthorized users)
