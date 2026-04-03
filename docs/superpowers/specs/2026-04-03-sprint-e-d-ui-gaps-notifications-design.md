# Sprint S5: UI-Lücken (Sprint E) + Notification Channels (Sprint D) — Design Spec

> **Note:** Authoritative session prompts will be in `scripts/sessions/s5a-prompt.md` and `scripts/sessions/s5b-prompt.md`.

## Problem Statement

Sprint C5 (CRM Core) and C6 (Data Enrichment) built backend capabilities that were never connected to the UI. An action→component trace revealed 8 server actions with zero UI consumers, 1 page without navigation, and 4 complete features invisible to users. Additionally, Sprint D (Notification Channels) is the next logical infrastructure step, building on the Domain Events and notification-dispatcher established in previous sprints.

## Current State

- **7 orphaned server actions:** `updateKanbanOrder`, `getJobStatusHistory`, `getStatusDistribution`, `triggerEnrichment`, `getEnrichmentStatus`, `getEnrichmentResult`, `refreshEnrichment`
- **1 redundant server action:** `getValidTransitions` — validation is done client-side via `isValidTransition()` import; server action can be removed or wired to Kanban drag-target highlighting (deferred, not in Sprint E scope)
- **1 hidden page:** `/dashboard/staging` — no sidebar link
- **Existing notification infrastructure:** `notification-dispatcher.ts` (242 LOC), `notification-dispatch.allium` (465 LOC), `event-bus.allium` (376 LOC), `Notification` Prisma model (in-app only)
- **Enrichment modules implemented:** 3 modules (clearbit, google-favicon, meta-parser) with index.ts + manifest.ts + resilience.ts each — but only module activation UI exists, no enrichment status/control UI
- **Test baseline:** 140 suites, 2606 tests, 79 E2E, 0 failures
- **Bug tracker:** 281 found, 281 fixed, 0 open

## Session Architecture

```
S5a: Sprint E (8 UI-Lücken) + Sprint D1 (Webhook Channel)
  ↓ Handoff: UI gaps closed, Webhook functional, tests green
S5b: Sprint D2 (E-Mail Channel) + Sprint D3 (Browser Push)
```

**Why E before D:**
- Status History Timeline (E1.2) is the only UI proof that `JobStatusChanged` events fire correctly — needed for E2E testing of Notifications
- Enrichment Control Panel (E1.1) shows the user modules that trigger notifications
- Dashboard Funnel (E2.1) visualizes the CRM pipeline that notification rules monitor

**S5a and S5b are independent sessions** — S5b needs the Channel abstraction that D1 establishes in S5a, but all Sprint E items are self-contained.

## Session S5a: Sprint E + Webhook Channel

### Scope

Close 8 Backend→Frontend gaps, then implement the first notification channel (Webhook).

### Phase 1: Sprint E1 — Critical UI Gaps

| Item | What | Files | Complexity |
|------|------|-------|------------|
| E1.1 | **Enrichment Control Panel** — Company-detail: enrichment status panel with "Refresh" button, logo preview, module info ("Enriched by: Clearbit") | New: `EnrichmentStatusPanel.tsx`. Modify: `JobDetails.tsx`, company detail. Consumers: `getEnrichmentStatus`, `getEnrichmentResult`, `refreshEnrichment`, `triggerEnrichment` | M |
| E1.2 | **Status History Timeline** — Job-detail: chronological transitions with notes, timestamps, user | New: `StatusHistoryTimeline.tsx`. Consumer: `getJobStatusHistory`. Preparation for 5.9 Timeline | M |
| E1.3 | **Kanban Within-Column Reorder** — Remove early-return at `KanbanBoard.tsx:156`, wire `updateKanbanOrder` | Modify: `KanbanBoard.tsx`, `useKanbanState.ts` | S |
| E1.4 | **Staging Queue Sidebar-Link** — Add to `SIDEBAR_LINKS` in `constants.ts` | Modify: `src/lib/constants.ts` | XS |

### Phase 2: Sprint E2 — Backend Capabilities Exposed

| Item | What | Files | Complexity |
|------|------|-------|------------|
| E2.1 | **Dashboard Status Funnel** — Conversion chart widget (Bookmarked → Applied → Interview → Offer) | New: `StatusFunnelWidget.tsx`. Consumer: `getStatusDistribution`. Use `/business-analytics:data-storytelling` | M |
| E2.2 | **Health Check Button** — "Check Now" per module in EnrichmentModuleSettings + ApiKeySettings | Modify: `EnrichmentModuleSettings.tsx`, `ApiKeySettings.tsx`. Consumer: `runHealthCheck` | S |
| E2.3 | **Ctrl+Z Global Undo** — `useEffect` keyboard listener in Layout, toast feedback | Modify: Layout component. Consumer: `undoLastAction` | S |
| E2.4 | **Retention Cleanup Admin UI** — "Run Cleanup" button + last execution info in Developer Settings | Modify: `DeveloperSettings.tsx`. Consumer: `runRetentionCleanup` | S |

### Phase 3: Sprint D1 — Webhook Channel

**New Prisma Models:**
```
model WebhookEndpoint {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  url       String
  secret    String   // HMAC secret for signature verification
  events    String   // JSON array of subscribed NotificationType values
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, active])
}
```

**Implementation:**
- HMAC Signing: `crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')` → `X-Webhook-Signature` header
- Event Filtering: User selects which `NotificationType` values trigger the webhook
- Retry: 3 attempts with exponential backoff (1s, 5s, 30s)
- Timeout: 10s per request
- **Retry Exhaustion:** After 3 failed attempts → create in-app notification "Webhook delivery failed for event X to endpoint Y". After 5 consecutive failures across different events → auto-deactivate endpoint with notification "Webhook endpoint {url} deactivated due to repeated failures". User can re-activate manually.
- **SSRF Protection:** New `validateWebhookUrl()` in `src/lib/url-validation.ts` — a SUPERSET of existing validators (NOTE: `validateOllamaUrl()` only checks protocol+credentials, `isBlockedHealthCheckUrl()` only checks IMDS — neither blocks private IPs). Must block: IMDS (169.254.169.254), RFC 1918 private IPs (10.x, 172.16-31.x, 192.168.x), localhost (127.x, ::1), non-http(s) protocols, URLs with credentials. Validate on create AND on dispatch (URL may resolve differently over time).
- **Secret Storage:** Webhook secret encrypted at rest via existing AES pattern (`src/lib/encryption.ts`). Decrypted on each HMAC signing. Secret rotation = generate new secret, old webhooks get new signature header.
- Settings UI: CRUD for webhook endpoints (URL, secret auto-generated, event selection, active toggle, delivery log with last 10 attempts)
- Channel Integration: Extend `notification-dispatcher.ts` with `WebhookChannel` adapter alongside existing in-app channel
- Allium Spec: Extend `notification-dispatch.allium` with webhook channel rules

**Existing infrastructure to build on:**
- `notification-dispatcher.ts` (242 LOC) — add channel routing logic
- `notification-dispatch.allium` — `NotificationChannel` enum already defines future channels
- `event-bus.allium` — event infrastructure is stable
- Credential encryption pattern from `credential-resolver.ts` for webhook secret storage

### Exit Criteria S5a

- All 8 Sprint E server actions have UI consumers (verified by action→component trace)
- `/dashboard/staging` in sidebar
- Webhook channel functional: create endpoint → trigger event → receive POST with HMAC signature
- E2E tests for: enrichment panel, status timeline, webhook settings
- Build green, all tests green
- BUGS.md, CHANGELOG.md, ROADMAP.md updated

---

## Session S5b: E-Mail + Browser Push Channels

### Scope

Implement the two remaining notification channels, building on the channel abstraction established by D1 in S5a.

### Phase 1: Sprint D2 — E-Mail Channel

**NOT the full Communication Connector (1.12).** Simple SMTP via nodemailer that evolves later.

- **Package:** `nodemailer` (well-established, MIT license). Agent MUST research API via WebSearch/Context7.
- **SMTP Settings:** Host, Port, Username, Password (encrypted via existing AES pattern), From address
- **SMTP Security:** Enforce TLS (reject plaintext SMTP connections). Rate limit outbound emails (10/minute per user). Rate limit test email button (1 per 60 seconds).
- **Prerequisite — New NotificationType Values:**
  The existing `NotificationType` enum only covers module/automation/vacancy events. E-Mail templates need NEW types:
  - Add `job_status_changed` to `NotificationType` enum + `notification.model.ts`
  - Wire `JobStatusChanged` domain event → `notification-dispatcher.ts` (currently NOT subscribed)
  - Update `notification-dispatch.allium` with new type + dispatch rules
  - This is FOUNDATION work — do it BEFORE building templates (Foundation-then-Fan-Out pattern)
- **Templates:** Per `NotificationType` — React-Email or Handlebars templates
  - Existing types: `module_deactivated`, `cb_escalation`, `consecutive_failures`, `auth_failure`, `vacancy_promoted`, `vacancy_batch_staged`, `bulk_action_completed`, `retention_completed`
  - New type: `job_status_changed` — "Job {title} at {company}: status changed to {newStatus}"
  - Each template gets all 4 locale variants (EN, DE, FR, ES)
- **Settings UI:** SMTP configuration page, test email button (rate-limited), per-type enable/disable
- **Channel Integration:** `EmailChannel` adapter in notification-dispatcher
- **Online Research:** Agent MUST research nodemailer API via WebSearch/Context7 before implementation

### Phase 2: Sprint D3 — Browser Push

**Minimal service worker (push-only, NOT full PWA).**

- **Package:** `web-push` (VAPID protocol). Agent MUST research API via WebSearch/Context7.
- **New Prisma Model:** `PushSubscription` (endpoint, p256dh, auth keys — all encrypted at rest via AES, userId)
- **VAPID Keys:** Generated on first use, stored encrypted in DB (`UserSettings` or dedicated table). NOT in env vars — self-hosted users shouldn't need manual key setup. If VAPID keys are lost/rotated, ALL existing push subscriptions become invalid → show warning in Settings before rotation.
- **Service Worker:** `public/sw-push.js` — minimal, handles `push` event only. Shows notification with title + body + click-action (navigates to relevant page).
- **Subscribe Flow:** Settings page → "Enable Push Notifications" → browser permission prompt → subscription saved. Unsubscribe removes `PushSubscription` record.
- **Channel Integration:** `PushChannel` adapter in notification-dispatcher
- **Stale Subscription Handling:** If `web-push` returns 410 Gone → delete the `PushSubscription` record silently.

### Exit Criteria S5b

- E-Mail channel: SMTP configured → notification triggers email → delivered
- Push channel: VAPID configured → subscription saved → notification triggers push → browser shows notification
- E2E tests for webhook + email + push settings
- `notification-dispatch.allium` updated with all 3 channel rules
- Build green, all tests green

---

## Rollback Strategy

Each session works on a dedicated branch (`session/s5a-ui-gaps-webhook`, `session/s5b-email-push`). Merge to main ONLY when exit criteria met. If D1 Webhook implementation breaks existing in-app notifications (they share `notification-dispatcher.ts`), the branch preserves the breakpoint and can be reverted.

**Critical:** Before modifying `notification-dispatcher.ts`, ensure existing in-app notification tests pass. Run tests AFTER each channel addition to catch regressions immediately.

## Notes on Specific Items

**E2.3 (Ctrl+Z Undo):** `BulkActionBar.tsx` uses token-based `undoAction(token)` for bulk staging operations. E2.3's `undoLastAction` is a DIFFERENT mechanism — global Ctrl+Z that undoes the last action regardless of context (like browser undo). No conflict — they're separate undo stacks. The keyboard listener goes in the Layout, calls `undoLastAction`, shows toast feedback.

**`getValidTransitions`:** Listed as redundant (client-side `isValidTransition()` covers the use case). Can optionally be wired to Kanban drag-target highlighting in a future sprint. NOT in Sprint E scope.

## Cross-Cutting: All Accumulated Learnings (15 Rules)

### Session Prompt Structure

Every session prompt follows: Context-Load → Quick-Verify → Context → Assignment with PFLICHT-Checkpoints → Cross-Cutting Rules → Exit Checklist.

### PFLICHT-Checkpoints with Evidence

Each phase has numbered checkpoints. Skills are invoked via `Skill()` tool (NOT `Agent()` tool). Evidence required before advancing.

### Foundation-then-Fan-Out (Interface Segregation for Agents)

1. Sequential Agent 0: Prisma schema + migrate + generate + types/interfaces
2. Main-agent verifies: `tsc --noEmit` = zero errors
3. Commit foundation
4. THEN dispatch parallel agents coding against stable type contracts

### VERBOTEN for Main-Agent

- ❌ Read/Edit/Write on code files (except BUGS.md, CHANGELOG.md, ROADMAP.md, CLAUDE.md, docs/)
- ❌ Write tests, fix findings, change UI components
- ❌ Replace `Skill()` calls with generic `Agent()` calls

Main-Agent may ONLY: dispatch/coordinate agents, verify results, update docs, git operations, build/test commands.

### Fix-Agents by File-Group (NOT Finding-Type)

Group ALL findings per file-group. One agent gets all findings for its files regardless of security/WCAG/performance classification.

### Three-Stage Analysis (CHECK Phase)

**Stage 1 (open, parallel):**
- `Skill("pr-review-toolkit:silent-failure-hunter")` → Blind Spots
- `Skill("ui-design:design-review")` + `Skill("accessibility-compliance:screen-reader-testing")` → DAU/BDU
- `Skill("developer-essentials:error-handling-patterns")` → Edge Cases

**Stage 2 (targeted follow-ups):**
- `Skill("security-scanning:stride-analysis-patterns")` + `Skill("pr-review-toolkit:pr-test-analyzer")` → Security + test gaps
- `Skill("ui-design:interaction-design")` → UX flows
- `Skill("application-performance:performance-optimization")` → Performance extremes

**Stage 3 (consolidation):**
- `Skill("agent-teams:multi-reviewer-patterns")` → deduplicate, calibrate severity
- Anti-silent-downgrade: "not fixable" must be explicitly communicated with justification

### Additional Rules

- **Build serialization:** Only main-agent runs `bun run build`. Agents use `tsc --noEmit`.
- **Consolidation-agent LAST:** Only after ALL review/fix agents complete.
- **67% fabrication verification:** Verify every "fixed" claim via `git diff`.
- **Anti-laziness:** "Time constraints", "good enough", "moving on" are INVALID skip reasons.
- **No sleep-loops:** Direct agent-completion queries.
- **Online research:** Agents MUST research APIs/packages (nodemailer, web-push) via WebSearch/Context7 before implementation.
- **Flashlight Effect:** After scoped fixes, grep project-wide for same patterns.
- **E2E Conventions:** Read `e2e/CONVENTIONS.md` before writing E2E tests.
- **No upstream PRs:** Never create PRs against Gsync/jobsync.

### Deferred Items Handoff

Each session reads deferred items from previous session's memory file. Schritt 0 in each prompt explicitly lists and addresses them.

### Git Rules

- Conventional commits with `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + tests before every commit
- Each session uses its own branch, merge to main when exit criteria met

### Prisma Workflow

```bash
bash scripts/prisma-migrate.sh   # Create migration
bash scripts/prisma-generate.sh  # Regenerate client
source scripts/env.sh && bun run build  # Verify build
```
Agent modifying schema MUST run prisma-generate as last step.
