# S5a-Resume Consolidated Review Report v2

**Date:** 2026-04-05
**Scope:** S5a session verification — Sprint E UI Gaps + Webhook Channel (D1)
**Method:** 8 specialized review agents + 4 fix agents, coordinated by main orchestrator
**Input:** Code quality (CP-1), Security (CP-1/CP-6), WCAG (CP-2), Interaction Design (CP-3), Data Storytelling (CP-4), Allium Weed (CP-10), Flashlight (CP-9), Agent Claims (CP-13)

---

## Executive Summary

S5a implementation is solid and well-architected. The ChannelRouter pattern (ADR-026) is extensible for D2/D3. The comprehensive re-review found **3 new findings** missed by the original S5a review: a CRITICAL i18n import violation, hardcoded English notification messages, and SSRF validator gaps for RFC-reserved ranges. All 3 have been fixed in this session.

## Findings Fixed in This Session

### CRITICAL (P0)
| ID | Finding | Fix | Verified |
|----|---------|-----|----------|
| CQ-01/WH-01 | `webhook.channel.ts` imports from forbidden `@/i18n/dictionaries` | Changed to `@/i18n/server` | git diff ✅, tsc ✅ |

### HIGH (P1)
| ID | Finding | Fix | Verified |
|----|---------|-----|----------|
| CQ-02 | 6 hardcoded English notification messages in dispatcher | Replaced with `t(locale, key)` calls, 6 keys in 4 locales | git diff ✅, tsc ✅ |
| WH-02 | SSRF validator missing CGN (100.64/10), IETF (192.0.0/24), Benchmark (198.18/15), Reserved (240/4) | Added 4 range blocks + 18 new tests (40→58) | git diff ✅, tests ✅ |
| WCAG-H1 | EnrichmentStatusPanel missing aria-live | Added aria-live="polite" to results container | git diff ✅ |
| WCAG-H4 | StatusHistoryTimeline color-only status | Verified text labels already present alongside colors | Correct pattern |
| WCAG-H6 | Kanban no keyboard reorder | FALSE POSITIVE — @dnd-kit useSortable includes KeyboardSensor | No change needed |

## Deferred to S5b (LOW)
| ID | Finding | Source |
|----|---------|--------|
| L1 | ToastProvider missing explicit duration prop | interaction-design |
| L2 | Funnel Widget no hover tooltips | data-storytelling |
| L3 | Timeline should virtualize at 200+ entries | performance |
| L4 | Data storytelling enhancements (trends, action suggestions) | data-storytelling |
| L5 | conversionRate should use formatNumber | data-storytelling |

## Allium Weed Results (CP-10)
- **0 S5a-caused divergences** — all webhook rules, events, entities align
- **11 pre-existing divergences** — dedup, quiet hours, batch summary, digest mode (spec-ahead-of-code)

## Flashlight Analysis (CP-9)
- FL-1: google-favicon redirect:manual — pre-existing, accepted risk
- FL-2: validateOllamaUrl IPv4-mapped IPv6 — by design
- All S5a-introduced fetch calls have redirect:manual ✅
- All S5a IDOR patterns verified correct ✅

## STRIDE Threat Analysis (CP-6)
- SSRF comprehensive after WH-02 fix
- HMAC signing correct (SHA-256)
- ADR-015 IDOR applied consistently
- Max 10 endpoints per user
- AES encryption for secrets

## Agent Claims Verification (CP-13)
6/6 claims verified via git diff — zero fabrication in this session

## Files Changed (This Resume Session)
| File | Changes |
|------|---------|
| `src/lib/notifications/channels/webhook.channel.ts` | i18n import fix |
| `src/lib/events/consumers/notification-dispatcher.ts` | i18n message keys |
| `src/i18n/dictionaries/notifications.ts` | 6 keys × 4 locales |
| `src/lib/url-validation.ts` | 4 SSRF range blocks |
| `__tests__/webhook-ssrf.spec.ts` | 18 new tests |
| `__tests__/notification-dispatcher*.spec.ts` | Updated for i18n |
| `src/components/enrichment/EnrichmentStatusPanel.tsx` | aria-live |
| `src/components/crm/StatusHistoryTimeline.tsx` | a11y attributes |
| `src/components/dashboard/StatusFunnelWidget.tsx` | formatNumber, i18n |
