# S5a-Resume Consolidated Review Report

**Date:** 2026-04-04
**Scope:** S5a session verification — Sprint E UI Gaps + Webhook Channel (D1)
**Input Reports:** 8 individual reviews (WCAG, Interaction Design, Data Storytelling, STRIDE, Performance, Test Gaps, UX Checklist, Allium Weed)

---

## Executive Summary

S5a implementation is solid. The ChannelRouter architecture, SSRF validator, and HMAC signing are well-designed. Two critical issues and several high findings were identified across 8 review dimensions. The most impactful is the EventBus synchronous blocking during webhook retry (up to 36s user-visible hang).

## Findings by Priority

### CRITICAL (P0 — Must Fix)

| ID | Category | Finding | Source Report | Fix |
|----|----------|---------|---------------|-----|
| C1 | Performance | EventBus blocks caller up to 36s during webhook retry | performance-analysis.md | Fire-and-forget in notification-dispatcher.ts |
| C2 | i18n | Missing key `errors.fetchStatusDistribution` in StatusFunnelWidget | ux-10point-checklist.md | Add key to 4 locales in jobs.ts dictionary |

### HIGH (P1 — Fix Before Merge)

| ID | Category | Finding | Source Report | Fix |
|----|----------|---------|---------------|-----|
| H1 | Testing | ChannelRouter (111 LOC) has zero unit tests | test-gap-analysis.md | New channel-router.spec.ts |
| H2 | A11Y | Missing aria-live regions on async operations (enrichment refresh, health check) | wcag-audit.md | Add aria-live="polite" to status areas |
| H3 | Dark Mode | DeveloperContainer StatusBanner hardcoded `bg-red-50 text-red-900` without dark variants | ux-10point-checklist.md, interaction-design.md | Add dark: classes |
| H4 | UX | 4 mock cards use native confirm() instead of AlertDialog | ux-10point-checklist.md | Migrate to Shadcn AlertDialog |
| H5 | A11Y | Webhook event checkboxes missing aria-required, aria-invalid | wcag-audit.md | Add ARIA attributes |
| H6 | Focus | ApiKeySettings cancel doesn't restore focus to button | ux-10point-checklist.md | Add focusRef |

### MEDIUM (P2 — Fix If Time Permits)

| ID | Category | Finding | Source Report |
|----|----------|---------|---------------|
| M1 | A11Y | Timeline status badges contrast in dark mode | wcag-audit.md |
| M2 | UX | Webhook expanded section lacks transition animation | interaction-design.md |
| M3 | Performance | resolveUserLocale redundant DB reads per failed delivery | performance-analysis.md |
| M4 | UX | Ctrl+Z undo has no confirmation for potentially destructive actions | ux-10point-checklist.md |
| M5 | A11Y | StatusFunnelWidget `text-green-600` without dark variant | wcag-audit.md |

### LOW (P3 — Defer to S5b)

| ID | Finding | Source Report |
|----|---------|---------------|
| L1 | ToastProvider missing explicit duration prop | interaction-design.md |
| L2 | Funnel Widget has no interactive data exploration (hover details) | interaction-design.md |
| L3 | Timeline should virtualize at 200+ entries | performance-analysis.md |
| L4 | Data storytelling enhancements (conversion rates, trends) | data-storytelling.md |

## Allium Weed Results

- **0 S5a-caused divergences** requiring fixes
- **11 pre-existing divergences** documented (dedup not implemented, quiet hours invariant, etc.)
- All 4 events (JobStatusChanged, CompanyCreated, EnrichmentCompleted, EnrichmentFailed) confirmed in event-types.ts

## STRIDE Threat Analysis

No CRITICAL/HIGH threats identified. SSRF validation is comprehensive. HMAC signing is correct. IDOR protection (ADR-015) properly applied. Max 10 endpoints per user prevents resource exhaustion.

## Flashlight Analysis (CP-9)

- **FL-1 (MEDIUM):** google-favicon fetch without redirect:manual — pre-existing, accepted risk
- **FL-2 (LOW):** validateOllamaUrl IPv4-mapped IPv6 — by design
- **CLEAN:** All S5a-introduced fetch calls have redirect:manual

## Agent Claim Verification (CP-13)

All 4 core S5a claims verified against git diff:
- WebhookChannel (384 LOC) with redirect:manual — CONFIRMED
- validateWebhookUrl SSRF superset — CONFIRMED
- ChannelRouter (110 LOC) — CONFIRMED
- 4 events in event-types.ts — CONFIRMED (pre-existing from S3/S4)

## Fix Plan (Grouped by File)

| Group | Files | Findings | Agent |
|-------|-------|----------|-------|
| A | notification-dispatcher.ts | C1 (fire-and-forget) | fix-agent-a |
| B | StatusFunnelWidget.tsx, jobs.ts dict | C2 (i18n key), M5 (dark text) | fix-agent-b |
| C | DeveloperContainer.tsx | H3 (dark mode), H4 (AlertDialog) | fix-agent-c |
| D | WebhookSettings.tsx, ApiKeySettings.tsx | H2, H5, H6 (a11y + focus) | fix-agent-d |
| E | New: channel-router.spec.ts | H1 (zero tests) | fix-agent-e |

## Deferred to S5b

- L1-L4 from LOW findings
- Data storytelling enhancements
- 11 pre-existing allium divergences
