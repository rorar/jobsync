# S5 Final Pre-Execution Review
## Sessions S5a + S5b — UI Gaps (Sprint E) + Notification Channels (Sprint D)

**Date:** 2026-04-04
**Reviewer:** Business Analytics — Final Pre-Execution Check
**Scope:** Codebase verification + Previous review gap analysis + Library research
**Basis:** Direct file inspection of 15 source files, online API research, comparison against pre-implementation checkup findings

---

## Hook: Between the Checkup and the Run

The previous review (s5-pre-implementation-checkup.md, dated 2026-04-03) found four blocking gaps and gave a conditional verdict. This review does something the previous one explicitly could not: it reads the actual codebase.

That changes several findings. Three of the four blockers were partially or fully invalidated by the codebase state. But it also opens three new issues the previous review missed. The most significant new finding does not appear in the pre-implementation checkup at all: E2.1 (StatusFunnelWidget) is already implemented and integrated, making the S5a Phase 2 feature description partly wrong before the session even starts.

---

## Key Metrics

```
Files inspected:        15
Action functions verified:  8
New issues found:            7
Previous blockers cleared:   2 of 4
Previous blockers still open: 2 of 4
Previous improvements addressed: 3 of 4
Overall readiness (S5a):   CONDITIONAL — 3 targeted fixes required
Overall readiness (S5b):   CONDITIONAL — 2 targeted fixes required + depends on S5a
```

---

## Part 1 — File Path Verification

Every file path mentioned in S5a and S5b was checked for existence.

```
FILE PATH VERIFICATION
=========================================================
Path                                              Exists?
---------------------------------------------------------
src/lib/events/consumers/notification-dispatcher.ts  YES (242 LOC)
src/models/notification.model.ts                      YES
src/lib/url-validation.ts                             YES
specs/notification-dispatch.allium                    YES (465 LOC)
specs/event-bus.allium                                YES
src/actions/enrichment.actions.ts                     YES
src/actions/job.actions.ts                            YES (functions verified)
src/components/kanban/KanbanBoard.tsx                 YES
src/lib/constants.ts (SIDEBAR_LINKS)                  YES
src/lib/encryption.ts                                 YES
src/components/myjobs/JobDetails.tsx                  YES
src/components/settings/EnrichmentModuleSettings.tsx  YES
src/components/settings/DeveloperSettings.tsx         YES
src/components/settings/ApiKeySettings.tsx            YES
src/components/dashboard/StatusFunnelWidget.tsx       YES (!)
---------------------------------------------------------
WebhookEndpoint (Prisma model)                        NO — to be created
SmtpConfig (Prisma model)                             NO — to be created
WebPushSubscription (Prisma model)                    NO — to be created
VapidConfig (Prisma model)                            NO — to be created
EnrichmentStatusPanel component                       NO — to be created
StatusHistoryTimeline component                       NO — to be created
=========================================================
```

All referenced existing paths exist. Models to be created are correctly absent.

---

## Part 2 — Action Function Verification

Every Server Action claimed by the prompts was verified to exist with the expected signature.

```
ACTION FUNCTION VERIFICATION
=========================================================
Function                  File                      Exists?  Signature Match?
-------------------------------------------------------------------------
triggerEnrichment()       enrichment.actions.ts     YES      YES — (companyId, dimension) -> ActionResult<EnrichmentResult>
getEnrichmentStatus()     enrichment.actions.ts     YES      YES — (companyId) -> ActionResult<EnrichmentResult[]>
getEnrichmentResult()     enrichment.actions.ts     YES      YES — (dimension, domainKey) -> ActionResult<EnrichmentResult | null>
refreshEnrichment()       enrichment.actions.ts     YES      YES — (resultId) -> ActionResult<EnrichmentResult>
getJobStatusHistory()     job.actions.ts            YES      YES — (jobId) -> ActionResult<StatusHistoryEntry[]>
updateKanbanOrder()       job.actions.ts            YES      YES — (jobId, newSortOrder, newStatusId?, note?) -> ActionResult<JobResponse>
getStatusDistribution()   job.actions.ts            YES      YES — () -> ActionResult<StatusDistribution[]>
undoLastAction()          undo.actions.ts           YES      YES — () -> ActionResult<{ tokenId: string | null }>
undoAction()              undo.actions.ts           YES      YES — (tokenId) -> ActionResult (token-based, for BulkActionBar)
runHealthCheck()          module.actions.ts         YES      YES
runRetentionCleanup()     stagedVacancy.actions.ts  YES      YES
=========================================================
```

All action functions exist. The prompt's critical distinction between `undoLastAction` (Ctrl+Z) and `undoAction` (token-based BulkActionBar) is correct and well-documented in the file.

---

## Part 3 — Claims About Current Code Behavior

This section verifies every behavioral claim in the prompts against the actual code.

### CLAIM VERIFIED: notification-dispatcher.ts is single-channel

The dispatcher in `src/lib/events/consumers/notification-dispatcher.ts` (242 LOC) creates `prisma.notification.create()` directly in each handler with no channel routing abstraction. `shouldNotify()` in `notification.model.ts` gates only `channels.inApp` as a single gate. Both claims are accurate.

### CLAIM VERIFIED: NotificationPreferences.channels is inApp-only

```typescript
// notification.model.ts line 31
channels: {
  inApp: boolean;
  // future: email: boolean; push: boolean; webhook: boolean;
};
```
The comment confirms the intent. The code has only `inApp`. S5a's claim is accurate.

### CLAIM VERIFIED: Kanban early-return at line ~156

`KanbanBoard.tsx` line 156 reads:
```typescript
if (sourceColumn === targetColumn) return;
```
The comment on the preceding line (155) says: "Same column - reorder (no-op for now, could add sort order)". The claim is accurate. The early return is present. Removing it and calling `updateKanbanOrder` is the correct fix.

### CLAIM VERIFIED: useKanbanState sorts by createdAt, not sortOrder

`useKanbanState.ts` lines 133-135:
```typescript
jobs: (jobsByStatus.get(statusValue) || []).sort((a, b) => {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}),
```
The prompt's claim is accurate. Within-column sort is by `createdAt desc`, not `sortOrder`.

### CLAIM VERIFIED: SIDEBAR_LINKS lacks staging entry

All 9 entries in `SIDEBAR_LINKS` (constants.ts) were checked. No `/dashboard/staging` entry exists. The `nav.staging` i18n key does NOT exist in dictionaries.ts (the `staging` namespace covers content strings like `staging.title`, not the nav key). Both gaps confirmed.

### CLAIM VERIFIED: event-bus.allium is missing 4 events in the Spec

The `event-bus.allium` spec's `DomainEventType` enum does NOT contain `JobStatusChanged`, `CompanyCreated`, `EnrichmentCompleted`, or `EnrichmentFailed`. The code's `event-types.ts` has all four (lines 39, 41, 42, 43). This is a genuine spec-code divergence. The S5a claim is accurate.

### CLAIM VERIFIED: isBlockedHealthCheckUrl does NOT block private IPs or localhost

Confirmed in `url-validation.ts`. The function blocks only `169.254.169.254` (IMDS) and `metadata.google.internal` (GCP). It does NOT block RFC 1918 ranges (10.x, 172.16-31.x, 192.168.x) or localhost (127.x, ::1). `validateOllamaUrl` blocks credentials and non-http(s) protocols but also does NOT block private IPs. The S5a claim that "bestehende Validators blocken KEINE private IPs" is accurate.

### FINDING [NEW-1, HIGH]: E2.1 StatusFunnelWidget is already implemented — S5a prompt is incorrect

`src/components/dashboard/StatusFunnelWidget.tsx` (89 LOC) already exists and already calls `getStatusDistribution()`. The file is complete with loading state, empty state, error state, and chart rendering (lines 12-101 verified). The component is NOT currently mounted on the dashboard page — there is no import of `StatusFunnelWidget` in any app page or layout file — but the component exists.

**Impact on S5a:** Phase 2 item E2.1 "Neues Component: `src/components/dashboard/StatusFunnelWidget.tsx`" asks the agent to CREATE a component that already exists. The full-stack-feature skill may attempt to overwrite it, duplicate it, or conflict with it.

**Required fix:** Change E2.1 in S5a to: "EXISTING component `src/components/dashboard/StatusFunnelWidget.tsx` — integrate into dashboard page. Component already calls `getStatusDistribution()`. Task is integration only (import + placement in the dashboard layout), not creation."

### CLAIM PARTIALLY CORRECT: notification-dispatch.allium comment status

The spec's `NotificationChannel` enum has future channels commented out:
```
enum NotificationChannel {
  inApp
  -- | email
  -- | push
  -- | webhook
}
```
S5a is correct that the spec needs extension. S5b's claim that "all 4 channels in notification-dispatch.allium" need to be present after S5b is also correct.

### CLAIM VERIFIED: encryption.ts exists and uses AES-256-GCM

`src/lib/encryption.ts` uses `aes-256-gcm` with PBKDF2 key derivation, per-record salt, and auth tags. The `encrypt(plaintext)` function returns `{ encrypted: string; iv: string }`. S5a's instruction to store webhook secrets "AES-verschlüsselt via `src/lib/encryption.ts`" is valid. The API matches what the agent needs.

---

## Part 4 — Previous Review Gap Status

```
PREVIOUS REVIEW BLOCKER STATUS
=========================================================
Blocker                              Status        Notes
---------------------------------------------------------
1. ChannelRouter in parallel agent   OPEN          Still present in S5a Phase 3
                                                   prompt. The orchestration
                                                   description still places the
                                                   ChannelRouter refactor within
                                                   Phase 3's implementation list
                                                   (steps 8-9) without sequencing
                                                   it before the parallel agents.
                                                   The Foundation-then-Fan-Out
                                                   section exists for Prisma only.

2. SMTP schema ambiguity             OPEN          S5b D2 prompt still says
                                                   "SmtpConfig Prisma Model
                                                   (eigene Tabelle: id, userId,
                                                   host, port...)" — this is now
                                                   explicit. The ambiguity from
                                                   the previous review ("eigene
                                                   Tabelle oder UserSettings")
                                                   WAS FIXED. The schema is now
                                                   resolved to a dedicated table.
                                                   Previous blocker CLEARED.

3. Service Worker discovery          OPEN          No discovery step was added
                                                   to S5b Phase 3. Codebase
                                                   confirmed: no existing SW
                                                   files in /public/. Risk is
                                                   reduced (no conflict possible)
                                                   but still not addressed.
                                                   Codebase evidence de-risks it
                                                   from BLOCKING to IMPROVEMENT.

4. event-bus.allium CP gate          OPEN          Still only mentioned in
                                                   implementation step 10 in S5a.
                                                   No standalone CP was added.
                                                   Remains an improvement gap.
---------------------------------------------------------
Improvements 5-8 from previous review:
5. Ctrl+Z CP clarification           PARTIALLY     CP-7 text unchanged. Still
                                                   doesn't explicitly verify
                                                   undoAction(token) in
                                                   BulkActionBar is unchanged.

6. Template count explicit           PARTIALLY     S5b now says "alle 9 existier-
                                                   enden NotificationType-Werte"
                                                   but doesn't enumerate them.
                                                   The actual count is 10 (see
                                                   FINDING NEW-2 below).

7. CP-15 target in S5b               NOT FIXED     CP-15 still exists in S5b
                                                   without a concrete target.

8. VAPID decision output             PARTIALLY     S5b now specifies
                                                   VapidConfig table explicitly.
                                                   Decision is resolved.
=========================================================
```

---

## Part 5 — New Findings (Not in Previous Review)

### FINDING [NEW-1, HIGH]: E2.1 StatusFunnelWidget component already exists

As documented in Part 3. The component file exists and calls `getStatusDistribution()`. S5a Phase 2 description is wrong about needing to create it. Requires a targeted fix to E2.1 description.

### FINDING [NEW-2, MEDIUM]: S5b template count claim is wrong — 10 types, not 9

The S5b prompt states "9 existing NotificationType values" in the template enumeration. The actual count in `notification.model.ts` is 10:

```
module_deactivated, module_reactivated, module_unreachable,
cb_escalation, consecutive_failures, auth_failure,
vacancy_promoted, vacancy_batch_staged, bulk_action_completed,
retention_completed
```

Plus `job_status_changed` will be added in S5b Phase 1, making the template target 11 × 4 = 44 templates, not 9 × 4 = 36. The `module_unreachable` type is missing from the enumeration in the prompt. An agent that enumerates from the prompt list rather than the model file will produce incomplete template coverage.

**Required fix:** Either explicitly list all 10 current types in S5b, or instruct the agent to enumerate them from `notification.model.ts` directly.

### FINDING [NEW-3, MEDIUM]: nodemailer v8.0.0 has a breaking change relevant to S5b

nodemailer released v8.0.0 on 2026-02-04 with a breaking change: error code `'NoAuth'` was renamed to `'ENOAUTH'`. Any code that checks SMTP authentication error codes by string must use the new constant. S5b instructs the agent to research the API online, which is sufficient to catch this — but the online research mandate must actually be enforced. The risk is that an agent trained on pre-v8 examples will produce code with the old error string, causing SMTP auth failure handling to silently fail.

**Impact:** Test coverage for SMTP auth failure scenarios may not catch this if mock responses use the old string.

**Required fix:** Add to S5b D2 spec: "Agent MUSS nodemailer Version 8.x API verwenden (current as of 2026-02-04). Breaking change: Error code `'NoAuth'` → `'ENOAUTH'` in v8.0.0. Teste SMTP auth failure handling mit dem neuen Error code."

### FINDING [NEW-4, LOW]: Service Worker scope confirmed clear — no conflict possible

Confirmed: `/public/` contains only `flags/`, `icons/`, `images/`. No existing service worker files. `next.config.mjs` has no PWA plugin. No TypeScript/TSX files reference `serviceWorker`. The service worker risk from the previous review is not present. **Previous Blocker 3 is de-risked from BLOCKING to LOW.**

The `Service-Worker-Allowed` header note in S5b is still technically correct — Next.js 15 requires setting this header in `next.config.mjs` responses if the service worker scope needs to exceed its directory. Since `public/sw-push.js` at the root will have `/` scope by default, this is only needed if a subdirectory path is used. Low risk, existing note in prompt is adequate.

### FINDING [NEW-5, LOW]: DeveloperSettings export name mismatch in S5a

S5a Phase 2, E2.4 says: "Modify: `src/components/developer/DeveloperContainer.tsx`". The actual file is `src/components/settings/DeveloperSettings.tsx` with export `default DeveloperSettings`. There is no `DeveloperContainer.tsx` in the developer or settings component directories.

**Impact:** An agent that tries to modify `DeveloperContainer.tsx` will create a new file rather than modifying the existing component. The `runRetentionCleanup` UI will be placed in the wrong file or duplicated.

**Required fix:** Change "Modify: `src/components/developer/DeveloperContainer.tsx`" to "Modify: `src/components/settings/DeveloperSettings.tsx` (component name: `DeveloperSettings`, default export)."

### FINDING [NEW-6, LOW]: The module_unreachable type is in the NotificationType model but NOT in CONFIGURABLE_NOTIFICATION_TYPES and not handled by the dispatcher

`notification.model.ts` defines `module_unreachable` as a valid `NotificationType`, but `CONFIGURABLE_NOTIFICATION_TYPES` does not include it, and `notification-dispatcher.ts` has no handler for it. This is pre-existing technical debt, not introduced by S5. However, S5b's template generation will need to handle it if the agent reads from `NotificationType` rather than `CONFIGURABLE_NOTIFICATION_TYPES`. Low impact, but worth noting as a pre-existing inconsistency agents will encounter.

### FINDING [NEW-7, LOW]: web-push package is stable — no breaking changes found

The web-push library API (`setVapidDetails`, `sendNotification`) has been stable since 2019. No breaking changes found for 2025-2026. The S5b agent's mandatory online research will confirm this. No prompt change needed.

---

## Part 6 — Previous Blockers: Required Prompt Changes

### Blocker 1 (STILL OPEN) — ChannelRouter sequencing in S5a

**What the previous review said:** Move ChannelRouter refactor from Schritt 2 (parallel) into Schritt 1 (sequential Foundation).

**Current state of S5a Phase 3:** The implementation order list (steps 1-10) is sequential by description, but the "Team-Orchestrierung" section says "Für Phase 1+2+3: Jede Phase startet `/full-stack-orchestration:full-stack-feature`", which launches parallel agents. The ChannelRouter refactor (step 9) will be picked up by a parallel agent in Schritt 2 alongside HMAC+Retry and Settings UI agents. The Foundation-then-Fan-Out guardrail applies only to Prisma schema.

**Fix still required:** In S5a Phase 3, extend CP-9 (the Foundation checkpoint) to explicitly include the ChannelRouter refactor:

```
CP-9 (REVISED): Webhook Foundation committed:
  - WebhookEndpoint Prisma schema created + migrated
  - Types: WebhookChannel Interface, WebhookDeliveryResult
  - validateWebhookUrl() in src/lib/url-validation.ts
  - ChannelRouter refactor committed: notification-dispatcher.ts
    restructured to multi-channel. shouldNotify() channel-aware.
    NotificationPreferences extended with webhook: boolean.
    DEFAULT_NOTIFICATION_PREFERENCES updated.
  - tsc --noEmit = 0
```

Then the Foundation-then-Fan-Out ordering is unambiguous: ALL of the above must be committed and verified before Schritt 2 (HMAC+Retry, Settings UI) parallelizes.

---

## Findings by Severity

```
FINDINGS REGISTER
=========================================================
ID      Severity  Category      Description
---------------------------------------------------------
NEW-1   HIGH      Stale Claim   StatusFunnelWidget already exists — E2.1
                                must be changed from "create" to "integrate"

NEW-2   MEDIUM    Wrong Count   Template count in S5b is 10 types (+ 1 new =
                                11), not 9. Missing: module_unreachable.

NEW-3   MEDIUM    Library API   nodemailer v8.0.0 breaking change: ENOAUTH
                                error code. Agent needs explicit instruction.

NEW-5   LOW       Wrong File    DeveloperContainer.tsx does not exist —
                                file is DeveloperSettings.tsx.

NEW-4   LOW       De-Risk       Service worker conflict risk cleared — no
                                existing SW files. No fix needed.

NEW-6   LOW       Pre-existing  module_unreachable in NotificationType but
                                not in dispatcher or CONFIGURABLE list.
                                Document for agent awareness only.

NEW-7   LOW       Library API   web-push stable — no action needed.

PREV-1  HIGH      Sequencing    ChannelRouter still in parallel scope.
                                CP-9 must be extended.

PREV-2  CLEARED   Schema        SMTP schema ambiguity resolved — SmtpConfig
                                table explicitly specified.

PREV-3  REDUCED   Discovery     SW conflict risk cleared by codebase check.
                                Prompt note adequate.

PREV-4  MEDIUM    Missing CP    event-bus.allium fix still has no standalone
                                checkpoint gate.
---------------------------------------------------------
BLOCKING (must fix):  NEW-1, NEW-5, PREV-1
IMPORTANT (should fix): NEW-2, NEW-3, PREV-4
INFORMATIONAL:        NEW-4, NEW-6, NEW-7
=========================================================
```

---

## Part 7 — Targeted Fix Instructions

The following changes are the minimum required before execution. All are prompt edits, no architecture changes.

### Fix 1: S5a E2.1 — Change "create" to "integrate" for StatusFunnelWidget

**File:** `scripts/sessions/s5a-prompt.md`

**Find (in Phase 2 / E2.1 section):**
```
**E2.1 (M): Dashboard Status Funnel**
- Neues Component: `src/components/dashboard/StatusFunnelWidget.tsx`
- Conversion-Chart: Bookmarked → Applied → Interview → Offer (mit Counts und Prozent)
- Consumer: `getStatusDistribution`
```

**Replace with:**
```
**E2.1 (M): Dashboard Status Funnel**
- ACHTUNG: `src/components/dashboard/StatusFunnelWidget.tsx` existiert BEREITS
  und ruft bereits `getStatusDistribution()` auf. NICHT neu erstellen.
- Aufgabe: Integration in die Dashboard-Page. Prüfe welche Dashboard-Page die
  Widgets rendert und füge `<StatusFunnelWidget />` dort ein.
- Verifiziere: Widget rendert korrekt mit Loading/Empty/Error-States (bereits
  implementiert), Dark Mode, Mobile. Fehlende i18n Keys ergänzen falls nötig.
```

Also update CP-5 to reflect this:
```
- [ ] CP-5: E2.1 Funnel-Widget im Dashboard sichtbar → `git diff` zeigt Import +
      Verwendung von StatusFunnelWidget in der Dashboard-Page (NICHT Neuerstellung)
```

### Fix 2: S5a CP-9 — Extend to include ChannelRouter refactor

**File:** `scripts/sessions/s5a-prompt.md`

**Find:**
```
- [ ] CP-9: Webhook Foundation committed (Schema + Types + SSRF-Validator) → `tsc --noEmit` = 0
```

**Replace with:**
```
- [ ] CP-9: Webhook Foundation committed (ALLE folgenden Punkte SEQUENZIELL, VOR Schritt 2):
  - WebhookEndpoint Prisma Model migriert + Client regeneriert
  - Types: WebhookChannel Interface, WebhookDeliveryResult in neuer Datei
  - validateWebhookUrl() in `src/lib/url-validation.ts` (SUPERSET: blockt
    IMDS/169.254.169.254, RFC 1918/10.x/172.x/192.168.x, localhost/127.x/::1,
    non-http(s), URLs mit Credentials)
  - ChannelRouter Refactoring COMMITTED: notification-dispatcher.ts ist
    jetzt multi-channel. shouldNotify() prüft Channel-spezifisch.
    NotificationPreferences hat `webhook: boolean`. DEFAULT_NOTIFICATION_PREFERENCES
    enthält `webhook: false`.
  - tsc --noEmit = 0
  ERST wenn dieses Checkpoint VOLLSTÄNDIG ist, darf Schritt 2 (PARALLEL:
  HMAC+Retry, Settings UI, Allium) starten.
```

### Fix 3: S5a E2.4 — Correct the file path for DeveloperSettings

**File:** `scripts/sessions/s5a-prompt.md`

**Find:**
```
- Modify: `src/components/developer/DeveloperContainer.tsx` — "Run Cleanup" Button + letzte Execution-Info
```

**Replace with:**
```
- Modify: `src/components/settings/DeveloperSettings.tsx` (Komponente heißt
  `DeveloperSettings`, default export) — "Run Cleanup" Button + letzte Execution-Info.
  ACHTUNG: DeveloperContainer.tsx existiert NICHT. Die korrekte Datei ist
  `src/components/settings/DeveloperSettings.tsx`.
```

### Fix 4: S5b — Correct notification type count and list them explicitly

**File:** `scripts/sessions/s5b-prompt.md`

**Find (in D2 section):**
```
- Test-Pflicht: Mock `nodemailer.createTransport()`, Snapshot-Tests für Templates × 4 Locales
```

**Replace with:**
```
- Test-Pflicht: Mock `nodemailer.createTransport()`, Snapshot-Tests für Templates × 4 Locales
- WICHTIG nodemailer v8.0.0: Error Code für SMTP Auth-Fehler ist `ENOAUTH`
  (geändert in v8.0.0 von `NoAuth`). Error-Handler müssen den neuen Code verwenden.
- Template-Vollständigkeit: Lies NotificationType aus `src/models/notification.model.ts`.
  Aktuell 10 Typen (+ job_status_changed = 11 nach Phase 1):
  module_deactivated, module_reactivated, module_unreachable, cb_escalation,
  consecutive_failures, auth_failure, vacancy_promoted, vacancy_batch_staged,
  bulk_action_completed, retention_completed, job_status_changed.
  Totale Templates: 11 × 4 Locales = 44. Zähle VOR CP-5 nach.
```

Also update CP-5:
**Find:**
```
- [ ] CP-5: E-Mail Templates für alle NotificationType in 4 Locales → `git diff`
```
**Replace with:**
```
- [ ] CP-5: E-Mail Templates für alle 11 NotificationType in 4 Locales = 44 Templates
      → `git diff` + Zählung bestätigen (44 Template-Funktionen/-Dateien)
```

---

## Part 8 — What Was Right in the Prompts

This section documents what is correct and does not require changes.

**Orchestration mechanics:** The Foundation-then-Fan-Out pattern, build serialization (single `bun run build` in main-agent), file-ownership segregation for parallel fix agents, and the 67% fabrication verification protocol are all correctly specified and consistent with what worked in S1-S4.

**Action signatures:** Every claimed action exists with the correct signature. The agent will not hit a "function not found" error on any of the 11 actions referenced in S5a/S5b.

**SSRF scope:** The claim that existing validators block no private IPs is accurate. The validateWebhookUrl() superset requirement is correctly specified.

**Kanban architecture decision:** The prompt correctly recommends Option (a) — switch to `getKanbanBoard` — and correctly identifies that `getKanbanBoard` was built with `sortOrder`. This is the right call. The prompt correctly identifies that the early-return at line 156 is the blocker.

**Encryption pattern:** The `src/lib/encryption.ts` AES-256-GCM implementation with per-record salt (ADR-017 compliant) is correctly referenced. The webhook secret and SMTP password can both use `encrypt()` / `decrypt()`. The API is stable.

**DeveloperSettings component (partial):** While the filename in E2.4 is wrong (see Fix 3), the `runRetentionCleanup` action in `src/actions/stagedVacancy.actions.ts` is correctly identified. The function exists at line 371.

**NotificationPreferences extension path:** The `// future: email: boolean; push: boolean; webhook: boolean;` comment in `notification.model.ts` confirms the intended extension point. S5a's instruction to extend this is aligned with the existing code intent.

**Three-Stage Analysis (Dreistufige Analyse):** Remains the strongest part of both prompts. The three-stage structure with parallel open analysis, targeted drill-down, and explicit anti-silence consolidation is well-designed.

---

## Part 9 — S5a → S5b Handoff Integrity (Updated)

```
S5b ASSUMPTION AUDIT (REVISED)
=========================================================
S5b Assumes                    S5a Delivers?   Risk (Updated)
---------------------------------------------------------------
Webhook functional             Yes (CP-10)     LOW
ChannelRouter committed        Conditional     MEDIUM → LOW if Fix 2 applied
  and verified                  on Fix 2
NotificationPreferences has    Same as         MEDIUM → LOW if Fix 2 applied
  webhook: boolean              above
shouldNotify() channel-aware   Same as         MEDIUM → LOW if Fix 2 applied
                                above
Build green + tests green      Yes (Exit       LOW
                                Checklist)
StatusFunnelWidget integrated  Yes if Fix 1    LOW if Fix 1 applied
  (not re-created)              applied
=========================================================
If all 5 fixes are applied: S5b starts on solid ground.
If Fix 2 is skipped: S5b D2 EmailChannel agent builds against
  an un-refactored dispatcher. This is the single highest-
  probability failure mode across both sessions.
```

---

## Verdict

```
SESSION READINESS ASSESSMENT (FINAL)
=========================================================
                   S5a              S5b
---------------------------------------------------------
Structural         GOOD             GOOD
Checkpoints        GOOD             GOOD
Skill Coverage     COMPLETE         COMPLETE
Dependency Chain   BLOCKER (Fix 2)  CONDITIONAL on S5a
Action Signatures  VERIFIED         VERIFIED (actions exist)
File Paths         1 ERROR (Fix 3)  CLEAN
Library APIs       CLEAN            1 ERROR (Fix 4)
Stale Claims       1 ERROR (Fix 1)  CLEAN
Error Risk (avg)   3.2/5            3.9/5
---------------------------------------------------------
Required fixes:    3 (Fixes 1-3)    2 (Fixes 4 + CP-5 text)
Estimated time:    20 minutes        10 minutes
---------------------------------------------------------
VERDICT:
  S5a: NOT READY — 3 targeted changes required (Fixes 1, 2, 3)
  S5b: NOT READY — 2 targeted changes required (Fix 4 + CP-5)
       and depends on S5a Fix 2 being applied
=========================================================
```

After the five fixes, both sessions are execution-ready. The ChannelRouter sequencing fix (Fix 2) is the only one that, if skipped, will cause cascading failure. The others prevent wasted agent cycles (Fix 1: prevents overwriting existing code), silent file errors (Fix 3: wrong path), and incomplete template coverage (Fix 4: wrong count).

Do the 30 minutes of prompt surgery. Then run.

---

## Appendix: Codebase State Summary at Review Time

```
Current notification types:        10 (no job_status_changed yet)
Current dispatcher subscriptions:  6 event types (no JobStatusChanged)
Webhook infrastructure:            0% — all to be created in S5a
SMTP infrastructure:               0% — all to be created in S5b
Push infrastructure:               0% — all to be created in S5b
Existing service workers:          NONE (public/ clean)
nodemailer in package.json:        NOT YET — to be installed in S5b
web-push in package.json:          NOT YET — to be installed in S5b
StatusFunnelWidget:                EXISTS — needs integration only
EnrichmentStatusPanel:             DOES NOT EXIST — create in S5a
StatusHistoryTimeline:             DOES NOT EXIST — create in S5a
nav.staging i18n key:              DOES NOT EXIST — create in S5a
```

---

*This report was produced by direct codebase inspection of 15 source files, verification of 11 action function signatures, comparison against the 2026-04-03 pre-implementation checkup, and online API research for nodemailer (v8.0.0, 2026-02-04) and web-push (stable). All findings are based on the codebase state as of 2026-04-04.*
