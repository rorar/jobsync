# Handoff

## State
6 commits pushed to `origin main` (`35a5d55`). 218 test suites, 4163 tests passing. Dev server on port 3737.

## Completed this session (2026-05-09)
1. **EuresLanguageCombobox** — hierarchical Popover+Command ComboBox, DynamicParamsForm type-dispatch
2. **Cross-level token filtering** — "Czech Interm" → Czech > B1 only, four filter modes
3. **cmdk hover bugfix** — explicit `value` props on CommandItems
4. **Allium spec alignment** — 3 spec gaps closed after allium:weed
5. **FL-3 Auth rate-limiting** — IP-based sliding window: signin 5/15min, signup 3/60min
6. **email.ts i18n split** — PrefixEqualsFilename invariant. Split email.ts (78 keys, 4 prefixes) → email.ts (16) + smtp.ts (31) + push.ts (15). Renamed errors.saveSmtp → smtp.errorSave (×4 SMTP, ×5 webhook). allium:weed: 0 divergences.

## Next
1. S2 (UX Journeys) / S3 (CRM Core) staged prompts
2. PERF-2 (async pbkdf2) / PERF-3 (notification dispatch queries)
3. Read `project_deferred_sprints_for_future_sessions.md` before cleanup sprints

## Context
- PrefixEqualsFilename invariant in i18n-system.allium enforces 1 prefix per dictionary file
- New channels (SMS, Slack) → create own namespace file, no cross-cutting errors.* prefix
- cmdk: always set explicit `value` prop on CommandItems in hierarchical lists
- Auth rate limiter follows `admin-rate-limit.ts` pattern (globalThis, server-only, sliding window)
- Tests: nice -n 10, --maxWorkers=1 (VM resource constraint)
