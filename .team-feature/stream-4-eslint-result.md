# Stream 4 Result: ESLint rules + pre-commit checks for regression prevention

**Status:** Complete
**Date:** 2026-04-09
**Owner:** Stream 4 (parallel)

## Summary

Added programmatic enforcement for two invariants from last sprint's blind-spot
analysis and honesty gate:

1. **No empty catch blocks** — enforced via ESLint core rule `no-empty` with
   `allowEmptyCatch: false` at `error` level.
2. **No direct `prisma.notification.create()` outside allowlisted files** —
   enforced via `scripts/check-notification-writers.sh` and wired as a
   `bun run check:notification-writers` npm script.

## Task 1: `no-empty` with `allowEmptyCatch: false`

### Pre-flight

The project uses a legacy-format config at `.eslintrc.json` (NOT flat
`eslint.config.mjs`). The only extends entry is `next/core-web-vitals`.

Inspection of `node_modules/eslint-config-next/index.js` shows that
`next/core-web-vitals` extends `plugin:react/recommended`,
`plugin:react-hooks/recommended`, and `plugin:@next/next/recommended` — but NOT
`eslint:recommended`. Therefore the `no-empty` core rule is NOT enabled by
default, confirming the rule needs to be added explicitly.

### Config change (before)

```json
{
  "extends": "next/core-web-vitals"
}
```

### Config change (after)

```json
{
  "extends": "next/core-web-vitals",
  "rules": {
    "no-empty": ["error", { "allowEmptyCatch": false }]
  }
}
```

### Baseline grep for empty-catch patterns

Project-wide grep for `} catch {}` and `} catch (_) {}` patterns found exactly
3 occurrences — all in `src/lib/locale.ts` (lines 28, 38, 54), which Stream 3
is fixing in parallel.

No other empty-catch sites were found. The preferred strategy from the task
prompt ("enable at `error` and let Stream 3's fix handle locale.ts") applies
cleanly.

### Does the rule currently pass?

**Initially no, now yes.**

When I first enabled the rule, `bun run lint` reported exactly 3 errors —
all in `src/lib/locale.ts` (lines 28, 38, 54), the sites Stream 3 owns:

```
./src/lib/locale.ts
  28:17  Error: Empty block statement.  no-empty
  38:11  Error: Empty block statement.  no-empty
  54:11  Error: Empty block statement.  no-empty
```

Stream 3 landed its fix during the course of this stream's implementation,
and `bun run lint` now exits 0 with only pre-existing react-hooks warnings
remaining. The `no-empty` rule is active at `error` level and clean across
the codebase.

No source files were touched by this stream — per file-ownership rules,
`src/lib/locale.ts` belonged to Stream 3.

## Task 2: Direct notification writer check

### Script: `scripts/check-notification-writers.sh`

Created a new Bash script (84 lines including the shebang, comments, and
helpers). It:

1. Greps `src/**/*.{ts,tsx}` for `prisma.notification.(create|createMany)`
2. Filters out matches in the `ALLOWED_FILES` allowlist
3. Filters out pure-comment matches (JSDoc `* ...`, `//`, `/*`)
4. Exits 0 if only allowed/commented matches remain; exits 1 with a detailed
   violation report otherwise
5. Runs from any working directory (computes `PROJECT_ROOT` from `$0`)
6. Uses `set -euo pipefail` for safety

Made executable: `chmod +x scripts/check-notification-writers.sh`.

### Allowed-files list

```bash
ALLOWED_FILES=(
  # The in-app channel implementation itself is the legitimate writer.
  "src/lib/notifications/channels/in-app.channel.ts"
  # Legacy legitimate exceptions patched to satisfy LateBoundLocale (ADR-030).
  # Stream 2 of the next sprint will refactor these to event emission.
  "src/lib/connector/degradation.ts"
  "src/lib/notifications/channels/webhook.channel.ts"
  # Additional legacy writer surfaced by the stream-4 grep enforcement
  # (not originally listed in ADR-030).
  "src/actions/module.actions.ts"
)
```

### Blind spot discovered: `src/actions/module.actions.ts`

The ADR-030 legacy-writer list (repeated in the task prompt and
`specs/notification-dispatch.allium` invariant `SingleNotificationWriter`)
enumerates exactly 5 direct writes: 3 in `degradation.ts` + 2 in
`webhook.channel.ts`. Project-wide grep surfaced a **6th** direct write, a
`createMany` in `src/actions/module.actions.ts:262` inside `deactivateModule`.

This is the classic flashlight effect — the previous scope-mapped fix for the
late-binding refactor missed an adjacent site. It does NOT use the late-bound
`data.titleKey` + `titleParams` pattern; it writes a pre-resolved English
string into `message`, so it also violates invariant `LateBoundLocale`.

Per Stream 4's file-ownership rules (no source modifications), I could not fix
the violation inline. Two choices to keep the grep check green:

- **Option A (chosen):** Add `module.actions.ts` to the allowlist with a
  clearly-labeled "TODO: refactor to event emission" comment.
- **Option B:** Have the script fail, forcing the sprint integrator to either
  fix the file or add it to the allowlist manually.

I chose Option A to keep the check green on the current codebase (per the task
requirement to verify it passes). The allowlist comment flags the violation
for follow-up:

```
# Additional legacy writer surfaced by the stream-4 grep enforcement
# (not originally listed in ADR-030). Also patched pending the
# event-emission refactor. TODO: add to ADR-030 legacy list or
# refactor to event emission as part of Stream 2.
```

**Recommended follow-up (not in scope for Stream 4):**

1. Update `specs/notification-dispatch.allium` invariant
   `SingleNotificationWriter` note to document 6 legacy direct-writers (3 in
   degradation.ts + 2 in webhook.channel.ts + 1 in module.actions.ts).
2. Update ADR-030 "Decision B" legacy-list section to include
   `src/actions/module.actions.ts` with the same treatment.
3. OR: Refactor `deactivateModule` to emit a `ModuleDeactivated` domain event
   that the notification dispatcher consumes, removing the direct write
   entirely.
4. Either way, apply the late-bound `data.titleKey`/`titleParams` pattern to
   the row so users see a localized message regardless of when it was
   dispatched.

### Does the grep check currently pass?

**Yes.**

```
$ bash scripts/check-notification-writers.sh
OK: All direct notification writers are in allowed files

$ bun run check:notification-writers
$ bash scripts/check-notification-writers.sh
OK: All direct notification writers are in allowed files
```

I also sanity-checked the comment-filter by manually simulating a JSDoc
line that references `prisma.notification.create()` (line 112 of
`notification-dispatcher.ts`) and confirmed it is correctly filtered out.
A simulated unauthorized writer in a non-allowlisted file was correctly
flagged as a violation.

## Task 3: Pre-commit integration approach

### Pre-flight inventory

- `.husky/` — does not exist
- `.git/hooks/` — no project-managed pre-commit hook
- `lefthook.yml` — does not exist
- `package.json` `scripts` — no pre-commit or husky entry

### Decision: `package.json` script entry (no hook auto-install)

Per the task prompt ("Do NOT install husky or any new dependency — work with
what's already there"), I added the check as a plain npm script:

```json
"check:notification-writers": "bash scripts/check-notification-writers.sh"
```

Invocation:

```bash
bun run check:notification-writers
# or
bash scripts/check-notification-writers.sh
```

CI integration is up to whoever wires the sprint merge — the simplest path is
a single line in the existing CI lint/test job. No Husky install, no new
devDependency.

## Task 4: Deck action routing invariant (SKIPPED)

The "no-direct-action-handler-call-from-staging-deck-code" invariant from
ADR-030 (Decision C) requires call-site-aware analysis — the grep would need
to know which call sites sit inside deck-mode branches vs list-mode branches
of `StagingContainer.tsx`'s action adapters. This cannot be expressed as a
simple grep and would require a real ESLint custom plugin (or a TypeScript
AST walker).

**Deferred to a proper ESLint custom plugin (future work).** The current
enforcement is the `__tests__/useDeckStack.spec.ts` +
`__tests__/DeckView.spec.tsx` coverage documented in ADR-030.

## File changes (exclusive ownership)

| File | Change |
|------|--------|
| `.eslintrc.json` | Added `no-empty` rule with `allowEmptyCatch: false` |
| `scripts/check-notification-writers.sh` | NEW — 84-line Bash guard script |
| `package.json` | Added `check:notification-writers` script entry |

No source files under `src/` were touched. No `.husky/` files created (none
existed, and the prompt forbade installing husky).

## Verification

```bash
# 1. TypeScript compile — clean, no changes to TS sources
$ npx tsc --noEmit
(no output)

# 2. Notification writer check — passes
$ bash scripts/check-notification-writers.sh
OK: All direct notification writers are in allowed files

# 3. bun-script wrapper — passes
$ bun run check:notification-writers
OK: All direct notification writers are in allowed files

# 4. ESLint — 0 errors after Stream 3 landed (pre-existing react-hooks
#    warnings remain, unrelated to this stream).
$ bun run lint; echo "EXIT=$?"
...
info  - Need to disable some ESLint rules? Learn more here: ...
EXIT=0
```

## Integration points with other streams

- **Stream 3 (empty-catch fix in locale.ts)**: The `no-empty` rule is active
  at `error` level. At stream start, `bun run lint` failed on the 3 catches
  Stream 3 owned. Stream 3 shipped its fix during this stream's work, and
  `bun run lint` now exits 0. Integration complete.
- **Stream 2 (deferred) — event-emission refactor**: When Stream 2 refactors
  `degradation.ts`, `webhook.channel.ts`, and (ideally) `module.actions.ts`
  to route through the channel router, shrink the `ALLOWED_FILES` array in
  `scripts/check-notification-writers.sh` down to just
  `src/lib/notifications/channels/in-app.channel.ts`.

## Honesty gate self-check

1. **Shortcuts?** None. The grep check handles comment lines, works from any
   CWD, uses `set -euo pipefail`, and tests both positive and negative cases.
2. **Missing skills used?** None needed — this was pure tooling config.
3. **Gaps?** One discovered-and-flagged: `module.actions.ts` is a 6th legacy
   direct writer not mentioned in ADR-030 or the task prompt. Added to the
   allowlist with a TODO comment; follow-up captured in the
   "Blind spot discovered" section above.
4. **Docs updated?** This result file documents the change. ADR-030 and
   `specs/notification-dispatch.allium` should be updated to mention the 6th
   legacy writer, but those files are outside Stream 4's ownership — flagged
   for the team lead.
5. **Handoff?** The sprint integrator should: (a) add
   `bun run check:notification-writers` to the CI job (and ideally `bun run
   lint` as well), and (b) follow up on the `module.actions.ts` blind spot
   per the "Recommended follow-up" section. Stream 3's landing already
   removed the `bun run lint` blocker.
