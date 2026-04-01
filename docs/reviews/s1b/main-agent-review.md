# S1b Main Agent Code Review

**Reviewer:** Claude Opus 4.6 (code-review expert)
**Date:** 2026-04-01
**Scope:** 7 files changed directly by the main agent during Session S1b

---

## 1. `src/lib/api/response.ts` -- inferErrorStatus i18n key matching

### FINDING [Medium] -- Incomplete i18n key coverage in inferErrorStatus

The new camelCase pattern matching catches many i18n keys but misses several that server actions actually emit:

| i18n key (lowercased) | Matched pattern | Inferred status | Expected status |
|---|---|---|---|
| `api.keymustberevoked` | none | 500 (sanitized) | 400 or 409 |
| `api.maxkeysreached` | none | 500 (sanitized) | 429 or 400 |
| `blacklist.patternrequired` | `"required"` | 400 | 400 (correct) |
| `blacklist.patterntoolong` | `"toolong"` | 400 | 400 (correct) |
| `api.keynamerequired` | `"required"` | 400 | 400 (correct) |
| `api.keyalreadyrevoked` | `"alreadyrevoked"` | 409 | 409 (correct) |

The `api.keyMustBeRevoked` and `api.maxKeysReached` keys fall through to status 500 and their messages get replaced with the generic "An unexpected error occurred." -- losing useful error context for API consumers.

**Mitigation:** Currently `actionToResponse()` is only called with `success: true` in the v1 routes (error paths use `errorResponse()` with explicit codes), so this is not yet a runtime issue. However, when future routes start passing failed `ActionResult` objects through `actionToResponse()`, these gaps will surface as bugs.

**Recommendation:** Consider adding patterns for `"mustbe"` -> 400, `"maxkeys"` or `"reached"` -> 429/400. Alternatively, adopt a structured error code field on `ActionResult` instead of inferring HTTP status from message string heuristics.

### FINDING [Low] -- Legacy "already exists" maps to 400, camelCase "alreadyexists" maps to 409

The legacy English pattern `"already exists"` is classified as 400 (VALIDATION_ERROR) on line 142, while the i18n pattern `"alreadyexists"` is classified as 409 (CONFLICT) on line 131. Since the i18n checks run first, the new behavior is 409 -- which is actually more correct semantically. But if any code path still sends the English `"already exists"` message (e.g. an older action), it would get a different status than the i18n version.

**Verdict:** Intentional improvement, but worth documenting that the legacy branch is now effectively dead for `"already exists"` since most callers now use i18n keys.

### PASS -- Security sanitization

The 500-to-generic-message sanitization at line 43 correctly prevents leaking internal error details to external API consumers (SEC-18). No new security concerns.

---

## 2. `src/app/api/v1/jobs/[id]/route.ts` -- buildUpdateData + interview cleanup

### PASS -- resolvedStatus variable fix (BS-02)

The replacement of the `_statusResolved` sentinel with a separate `resolvedStatus` variable is correct and cleaner:

- `resolvedStatus` is typed `{ id: string } | null | undefined`
- `undefined` means status was not in the update; `null` means status lookup failed
- The check on line 192 `if (!resolvedStatus)` correctly catches both `null` (invalid status) and `undefined`-would-not-reach-here (guarded by `updates.status !== undefined`)
- No data pollution of the Prisma `data` object

**One subtle note:** If `resolvedStatus` returns `null` from Prisma (status not found), line 192 correctly returns a 400 error. If the `resolveStatus` Promise rejects, `Promise.all` on line 188 would throw, and `withApiAuth` must catch it. This is correct since `withApiAuth` has a try/catch wrapper.

### PASS -- IDOR fix on interview.deleteMany

Line 100: `await prisma.interview.deleteMany({ where: { jobId, job: { userId } } })` correctly adds the `job: { userId }` ownership check, following ADR-015. This is defense-in-depth since the preceding `findFirst` on line 91 already verified ownership of the job, but the nested filter prevents a TOCTOU race where the job could be reassigned between the check and the delete (unlikely in practice but correct to guard against).

### PASS -- Ownership checks

All Prisma queries include `userId` in the where clause. The `findFirst` pattern is used correctly instead of `findUnique` when combining ID + userId filters. Resume and tag ownership validation is present.

---

## 3. `src/app/api/scheduler/status/route.ts` -- Variable shadowing + non-null assertion removal

### PASS -- Removed inner userId shadowing

The comment on line 80 confirms the `userId` variable from the outer scope (line 46) is now used directly in `filterStateForUser()`. This eliminates the previous shadowing where an inner `const userId = session.user.id` could have masked the outer variable. The closure correctly captures the outer `userId`.

### PASS -- Removed `!` non-null assertion

The session check on line 42 `if (!session?.user?.id)` guarantees `session.user.id` is truthy when line 46 is reached. Using `const userId = session.user.id` without `!` is safe because the early return ensures control flow only reaches this point when the value is defined. TypeScript should narrow correctly here.

### PASS -- SSE security filtering

The `filterStateForUser()` function correctly filters `runningAutomations`, `pendingAutomations`, and `runningProgress` by userId, preventing cross-user data leakage via the SSE endpoint.

---

## 4. `src/components/settings/PublicApiKeySettings.tsx` -- Wrapping result.message in t()

### PASS -- i18n wrapping of error messages

Lines 88, 113, and 134 all follow the pattern:
```tsx
description: result.message ? t(result.message) : undefined,
```

This correctly translates i18n keys (e.g. `"api.maxKeysReached"`) returned by server actions via `handleError()`. The `t()` function returns the key itself if no translation is found (verified in `dictionaries.ts` line 326: `return dict[key] ?? key`), so unknown keys degrade gracefully to showing the raw key rather than crashing.

### FINDING [Low] -- handleError fallback messages are still English

This is a pre-existing issue, not introduced by S1b, but interacts with the new `t()` wrapping: `handleError(error, "Failed to create API key.")` on line 67 of `publicApiKey.actions.ts` has an English fallback `msg` parameter. If an unexpected error occurs where `error.message` is falsy, `handleError` returns this English string. Then `t("Failed to create API key.")` returns the English string verbatim since it is not a dictionary key.

**Verdict:** Not a regression. The S1b change actually improves the situation for the common case (i18n keys are now translated). The edge case fallback was already English before.

---

## 5. `src/models/companyBlacklist.model.ts` -- Extended BlacklistMatchType + matcher

### PASS -- Type extension

`BlacklistMatchType` is correctly extended from `"exact" | "contains"` to `"exact" | "contains" | "starts_with" | "ends_with"`. This is a string union, compatible with the Prisma schema where `matchType` is a plain `String` column.

### PASS -- Matcher implementation

The `matchesBlacklistEntry` function correctly implements all four match types:
- `"exact"`: `name === pattern` (case-insensitive via `.toLowerCase()`)
- `"contains"`: `name.includes(pattern)` (substring)
- `"starts_with"`: `name.startsWith(pattern)` (prefix)
- `"ends_with"`: `name.endsWith(pattern)` (suffix)

Both inputs are trimmed and lowercased, preventing whitespace/case edge cases.

The `switch` statement is exhaustive (TypeScript will error if a new variant is added to `BlacklistMatchType` without a case), which is good.

### PASS -- Runtime validation in actions

`companyBlacklist.actions.ts` line 44 has a `VALID_MATCH_TYPES` array that includes all four values: `["exact", "contains", "starts_with", "ends_with"]`. This guards against client-submitted invalid values since TypeScript types are erased at runtime (SEC-14).

### FINDING [Info] -- Prisma schema comment is stale

The Prisma schema at line 542 still reads:
```prisma
matchType String @default("contains") // "exact" | "contains"
```

The comment should be updated to `// "exact" | "contains" | "starts_with" | "ends_with"` to reflect the expanded type. This is documentation-only -- no functional impact since Prisma treats it as a plain String.

---

## 6. `src/i18n/dictionaries/deck.ts` -- Added deck.viewModeLabel

### PASS -- All 4 locales present

The `deck.viewModeLabel` key is added to all 4 locale blocks:
- `en`: "View mode"
- `de`: "Ansichtsmodus"
- `fr`: "Mode d'affichage"
- `es`: "Modo de vista"

Translations are appropriate and consistent with existing locale style.

### PASS -- Key naming convention

The key `deck.viewModeLabel` follows the `namespace.camelCaseKey` convention specified in CLAUDE.md.

---

## 7. `src/components/staging/ViewModeToggle.tsx` -- i18n aria-label

### PASS -- Accessibility improvement

The `aria-label` on line 30 is correctly changed from a hardcoded English string to `t("deck.viewModeLabel")`, making the radiogroup label locale-aware for screen readers.

### PASS -- Import pattern

Uses `import { useTranslations } from "@/i18n"` as required by CLAUDE.md for client components. Does not import from internal modules.

---

## Summary

| # | File | Verdict | Findings |
|---|---|---|---|
| 1 | `src/lib/api/response.ts` | FINDING | [Medium] Incomplete i18n key coverage; [Low] legacy/i18n status code inconsistency |
| 2 | `src/app/api/v1/jobs/[id]/route.ts` | PASS | Clean fix, correct IDOR defense-in-depth |
| 3 | `src/app/api/scheduler/status/route.ts` | PASS | Correct shadowing + assertion removal |
| 4 | `src/components/settings/PublicApiKeySettings.tsx` | PASS | Correct i18n wrapping; [Low] pre-existing handleError fallback |
| 5 | `src/models/companyBlacklist.model.ts` | PASS | Correct type + matcher extension; [Info] stale schema comment |
| 6 | `src/i18n/dictionaries/deck.ts` | PASS | Complete across all 4 locales |
| 7 | `src/components/staging/ViewModeToggle.tsx` | PASS | Correct accessibility + i18n fix |

**Overall assessment:** All changes are correct and follow project patterns. No security regressions. The one medium finding (incomplete `inferErrorStatus` coverage) is not yet reachable at runtime but should be addressed before future API routes start passing failed `ActionResult` objects through `actionToResponse()`.
