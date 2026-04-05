# S5b Consolidated Review Report — All Dimensions

**Date:** 2026-04-05
**Sources:** 8 review reports across 6 dimensions
**Methodology:** Parallel multi-dimensional review → deduplication → severity calibration

## Source Reports (in docs/reviews/s5b/)

1. `code-quality.md` — 20 findings (2C, 5H, 8M, 5L)
2. `architecture.md` — 10 findings (0C, 1H, 5M, 4L)
3. `security-audit.md` — 15 findings (1C, 3H, 4M, 7L)
4. `performance.md` — 17 findings (3C, 4H, 6M, 4L)
5. `testing-coverage.md` — 10 gaps (4H, 4M, 2L)
6. `wcag-audit.md` — 14 findings (1C, 4H, 5M, 4L)
7. `interaction-design.md` — 14 findings (3H, 7M, 3L-ish)
8. `data-storytelling.md` — Business analytics (P0-P3 recommendations)
9. `best-practices.md` — 12 findings (0C, 2H, 5M, 5L)

**Raw total: ~112 findings**

## Deduplication Summary

Many findings were cross-confirmed across multiple reviews. After deduplication:

| Finding | Confirmed By | Final Severity |
|---------|-------------|----------------|
| sendTestPush raw i18n key | C-1, SEC-S5B-02, GAP-3, ID-013 | **CRITICAL** |
| Missing import "server-only" | H-5, SEC-S5B-01, HIGH-1, F-08 | **HIGH** |
| resolveUserLocale 4× duplication | H-1, SEC-S5B-07, HIGH-2, F-02 | **HIGH** |
| PushChannel 401/403 deletion | L-2, SEC-S5B-03, F-09, GAP-4 | **HIGH** |
| Sequential channel dispatch | PERF-1, F-04, SEC-S5B-15 | **HIGH** (perf) |
| No input length validation | SEC-S5B-04 | **MEDIUM** |
| Transport config duplication | H-2 | **MEDIUM** |
| SmtpSettings no form element | WCAG-A10 | **HIGH** (a11y) |
| Password toggle not keyboard reachable | WCAG-A03 | **HIGH** (a11y) |

## MUST-FIX Findings (Grouped by File for Agent Dispatch)

### Group A: push.actions.ts + push.channel.ts (7 findings)
| ID | Sev | Finding | Source |
|----|-----|---------|--------|
| A1 | **CRIT** | sendTestPush sends raw i18n key "push.testBody" | C-1,SEC-02 |
| A2 | HIGH | sendTestPush uses wrong NotificationType module_unreachable | SEC-12 |
| A3 | HIGH | sendTestPush double-charges rate limits (new PushChannel) | H-3 |
| A4 | HIGH | PushChannel deletes subscriptions on 401/403 (should only 410/404) | F-09,SEC-03 |
| A5 | MED | No input length validation on subscribePush | SEC-04 |
| A6 | LOW | PushSettings uses pushTestFailed toast for non-test errors | L-5 |
| A7 | LOW | Push notification title hardcoded "JobSync" | M-2 |

### Group B: SmtpSettings.tsx + PushSettings.tsx (10 findings)
| ID | Sev | Finding | Source |
|----|-----|---------|--------|
| B1 | **HIGH** | SmtpSettings inputs not in `<form>` element (WCAG 1.3.1) | WCAG-A10 |
| B2 | HIGH | Password toggle tabIndex={-1} (keyboard unreachable) | WCAG-A03 |
| B3 | HIGH | No progress indication during 30s SMTP timeout | ID-001 |
| B4 | HIGH | Edit/Delete buttons clickable during test-in-flight | ID-002 |
| B5 | MED | SmtpSettings edit button uses Save i18n key | L-4,ID-003 |
| B6 | MED | Missing aria-invalid + aria-describedby on inputs | WCAG-A01 |
| B7 | MED | Missing aria-live for cooldown/status changes | WCAG-A04 |
| B8 | MED | VAPID rotation button uses primary not destructive styling | ID-007 |
| B9 | MED | Push "Enable" stays clickable after browser blocks permission | ID-004 |
| B10 | MED | autoComplete="new-password" triggers password gen prompts | ID-012 |

### Group C: channel-router.ts + notification-dispatcher.ts (3 findings)
| ID | Sev | Finding | Source |
|----|-----|---------|--------|
| C1 | **HIGH** | Sequential channel dispatch → Promise.allSettled | PERF-1,F-04 |
| C2 | HIGH | Add import "server-only" | H-5,SEC-01 |
| C3 | MED | Dispatcher 2 DB calls for same user row | M-3 |

### Group D: email.channel.ts + smtp.actions.ts + templates.ts (7 findings)
| ID | Sev | Finding | Source |
|----|-----|---------|--------|
| D1 | HIGH | Extract shared resolveUserLocale (4× duplication) | H-1,SEC-07 |
| D2 | HIGH | Extract shared createSmtpTransporter factory | H-2 |
| D3 | HIGH | Add import "server-only" to email.channel.ts | H-5 |
| D4 | MED | buildNotificationMessage double replacement bug | C-2,M-1 |
| D5 | MED | No input length validation on saveSmtpConfig | SEC-04 |
| D6 | MED | Email template footer contrast 4.2:1 < 4.5:1 AA | WCAG-A06 |
| D7 | MED | Plain-text body no control-char sanitization | SEC-06 |

### Group E: All channel files (2 findings)
| ID | Sev | Finding | Source |
|----|-----|---------|--------|
| E1 | HIGH | Add import "server-only" to webhook.channel.ts | H-5 |
| E2 | HIGH | Add import "server-only" to in-app.channel.ts | H-5 |

### Group F: Tests (4 findings)
| ID | Sev | Finding | Source |
|----|-----|---------|--------|
| F1 | HIGH | Zero tests for smtp.actions.ts | GAP-1 |
| F2 | HIGH | Zero tests for push.actions.ts | GAP-2 |
| F3 | HIGH | No regression test for translated test push | GAP-3 |
| F4 | HIGH | No test for 401/403 non-deletion behavior | GAP-4 |

## DEFERRED Findings (P2/P3 — documented, not fixed this session)

| ID | Sev | Finding | Reason |
|----|-----|---------|--------|
| PERF-2 | CRIT(perf) | Sync PBKDF2 in encryption.ts | Shared module — needs broader testing. Document in BUGS.md |
| PERF-3 | CRIT(perf) | 15 redundant DB queries per notification | Architectural refactor (DispatchContext) — needs design. Document in BUGS.md |
| PERF-4 | HIGH(perf) | No SMTP connection pooling | Enhancement, not bug. Backlog |
| F-10 | LOW | Deduplication rule not implemented | Known spec-ahead-of-code, documented |
| DS-P0 | MED | channels.email not auto-set on SMTP config save | Verify and fix if confirmed |
| DS-P1 | MED | No unified channel health overview | Feature request for future sprint |

## Totals (Deduplicated, Must-Fix)

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 16 |
| Medium | 14 |
| Low | 2 |
| **Total Must-Fix** | **33** |
| Deferred | 6 |

## Stage 2 Additions (CP-6)

### From STRIDE Analysis (docs/reviews/s5b/stride-analysis.md)
| ID | Sev | STRIDE | Finding | Status |
|----|-----|--------|---------|--------|
| D-04 | MED | DoS | No input length validation on push subscription fields | **Add to Group A** |
| D-05 | MED | DoS | No input length validation on SMTP config fields | **Add to Group D** |
| I-05 | MED | Info Disclosure | console.error logs raw error objects from decrypt failures | **New: sanitize** |
| R-01 | MED | Repudiation | No audit logging for SMTP credential changes | Deferred (next sprint) |
| T-05a | MED | Tampering | DNS rebinding gap in SMTP host validation | Accepted risk (documented) |
| I-06 | MED | Info Disclosure | getOrCreateVapidKeys decrypts private key unnecessarily | Deferred |
| E-05 | LOW | EoP | SMTP host change without password re-entry | Deferred |

### From Test Gap Verification (docs/reviews/s5b/test-gap-verification.md)
All 6 gaps CONFIRMED:
- GAP-1: smtp.actions.ts 0% coverage → CRITICAL
- GAP-2: push.actions.ts 0% coverage → CRITICAL
- GAP-3: sendTestPush raw i18n key → CRITICAL (real bug confirmed)
- GAP-4: PushChannel 401/403 deletion untested → HIGH
- GAP-5: SMTP validation octal/hex bypasses → known gap, document
- GAP-6: buildNotificationMessage interpolation untested → CRITICAL

### Updated Must-Fix Count
| Severity | Phase 1 | + Stage 2 | Total |
|----------|---------|-----------|-------|
| Critical | 1 | 0 | 1 |
| High | 16 | 1 (I-05) | 17 |
| Medium | 14 | 2 (D-04,D-05 already counted) | 14 |
| Low | 2 | 0 | 2 |

### Anti-Silent-Downgrade: Explicitly Deferred Items
These are NOT being fixed this session, with explicit justification:
1. **PERF-2 (sync PBKDF2):** Touches shared encryption.ts used by all channels + webhooks + API keys. Needs dedicated session with broader test coverage.
2. **PERF-3 (DispatchContext):** Architectural refactor across 5+ files. Needs design before implementation.
3. **R-01 (audit logging):** New feature, not a bug. Backlog item.
4. **I-06 (VAPID public-only function):** Enhancement, not security vulnerability. Backlog.
5. **E-05 (SMTP host change without re-auth):** Edge case requiring session hijack first. Accepted risk.
6. **T-05a (DNS rebinding):** Requires IP resolution at connect time, which nodemailer handles internally. Accepted risk.
