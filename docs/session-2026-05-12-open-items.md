> **[SUPERSEDED → docs/BACKLOG.md]** (2026-05-31) — Offene Items konsolidiert + code-verifiziert in BACKLOG. Nur Historie.

# Session 2026-05-12 — Open Items

23 items remaining from the S3 CRM Deferrals + Architecture Fixes session.

## Category A: Cleanup (commit/delete/gitignore)

| # | Item | Effort | Action |
|---|------|--------|--------|
| 1 | `docs/feature-map-and-gaps.md` untracked | 1 min | `git add` + commit |
| 2 | `.full-review/` review artifacts in repo | 1 min | Add to `.gitignore` or delete |
| 3 | `.full-stack-feature/state.json` stale from prior session | 1 min | Delete |
| 4 | `docs/ROADMAP.md` 5.4 + 5.9 text stale | 10 min | Update "Offen" → implemented, "DONE" → "PARTIAL" |

## Category B: Quick Fixes (~30 min total)

| # | Item | File | Effort |
|---|------|------|--------|
| 5 | `extractDomain` wrong for Unicode names ("Müller" → "mller.com") | `domain-extractor.ts` | 15 min |
| 9 | `crm-cron.ts` uses `let` not `globalThis` — HMR duplicate timers | `crm-cron.ts:19` | 5 min |
| 10 | `Promise.all` → `Promise.allSettled` in `runCrmTemporalRules` | `crm-cron.ts:220` | 5 min |
| 16 | `retention_expired` maps to `contact_from_job` (semantically wrong) | `notification-dispatcher.ts` | 15 min (new NotificationType) |
| 17 | Missing `.title` i18n keys for late-binding pattern | `notifications.ts` (i18n) | 10 min |
| 20 | `job.actions.spec.ts` deleteJobById pre-existing failure | `job.actions.spec.ts` | 15 min |

## Category C: Design Decision or Dedicated Sprint

| # | Item | Context | Depends on |
|---|------|---------|------------|
| 11 | `shared-entities.allium` missing `domain` field on Company | Spec-Code drift | allium:tend session |
| 12 | CRM Cron separation not documented as ADR | Architecture decision undocumented | ADR authoring |
| 14 | ROADMAP 5.9 "DONE" but CompanyTimeline + JobTimeline not built | False DONE status | S2 UX session |
| 15 | CompanyTimeline + JobTimeline surfaces (spec defined, no component) | Spec surfaces without UI | S2 UX session + ui-design agent |
| 18 | `AutomationDegraded` → CRM Timeline needs Payload `moduleId` extension | connectors agent finding | Payload interface change + 3 emit sites |
| 19 | 7 of 8 Event Payloads too thin (Consumer does DB lookups) | schema agent finding | Fat payload refactor across all publishers |
| 21 | `crm-activity-logger.spec.ts` — no tests for consumer (9 subscriptions) | Test gap | Test sprint |
| 22 | `crm-cron.spec.ts` — no tests for temporal rules cron | Test gap | Test sprint |

## Category D: Accepted / Documented

| # | Item | Why accepted |
|---|------|--------------|
| 6 | `expireAutoCreatedPersons` return value — already fixed (returns `archived` count) | Fixed in commit `6fa168e` |
| 7 | `DatePicker.tsx` `ControllerRenderProps<any, any>` type erasure | Pre-existing, not introduced this session |
| 8 | ROADMAP 5.4 stale text (duplicate of #4) | Covered by #4 |
| 13 | A-12 CRM Cron architecture undocumented (duplicate of #12) | Covered by #12 |
| 23 | `domain-experts` skill untested on other projects | Session tooling, not production code |

## Cross-References

- Code Review: `.full-review/01a-code-quality.md` (13 findings, 9 fixed)
- Architecture Review: `.full-review/01b-architecture.md` (13 findings from architect agent)
- Domain Expert findings: 8 agents queried, results in agent transcripts
- Gap analysis: `docs/feature-map-and-gaps.md`
- Memory: `~/.claude/projects/-home-pascal/memory/project_current_sprint.md`
