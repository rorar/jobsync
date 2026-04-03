# S5 Pre-Implementation Checkup Report
## Sessions S5a + S5b — UI Gaps (Sprint E) + Notification Channels (Sprint D)

**Date:** 2026-04-03
**Reviewer:** Business Analytics Pre-Flight Analysis
**Status:** CONDITIONAL — 4 blocking gaps require remediation before execution

---

## Hook: The Promise and the Gap

Session S5 is the most structurally complex sprint in the JobSync history. It spans two sessions, three notification channels, eight UI repairs, two Prisma schema extensions, a complete channel abstraction refactor, a Service Worker, and a foreign library integration mandate. The prompts for S5a and S5b are among the most detailed ever written for this project — running to 389 and 334 lines respectively. Length is not the problem.

The problem is what is missing between the lines.

This report is the result of a systematic comparison of S5a and S5b against the S4 template, the design spec, and each other. The verdict: both prompts are strong on orchestration mechanics and weak on failure surface specification. Three of the five phases carry elevated agent failure risk. And the handoff from S5a to S5b contains one assumption that, if wrong, will cause S5b to begin on broken ground.

Read this before you run a single agent.

---

## Context: What S5 Is Trying to Do

```
Sprint E (S5a Phase 1+2): Close 8 Backend→Frontend gaps
  E1.1  Enrichment Control Panel           (M)
  E1.2  Status History Timeline            (M)
  E1.3  Kanban Within-Column Reorder       (S)
  E1.4  Staging Queue Sidebar-Link         (XS)
  E2.1  Dashboard Status Funnel            (M)
  E2.2  Health Check Button                (S)
  E2.3  Ctrl+Z Global Undo                 (S)
  E2.4  Retention Cleanup Admin UI         (S)

Sprint D1 (S5a Phase 3): Webhook Channel
  Foundation: WebhookEndpoint schema, SSRF validator, types
  Impl:       HMAC signing, retry, auto-deactivation, Settings UI
  Refactor:   notification-dispatcher.ts → multi-channel ChannelRouter

Sprint D2 (S5b Phase 2): E-Mail Channel
  Foundation: SMTP schema, nodemailer, templates (all types × 4 locales)
  New type:   job_status_changed in NotificationType enum

Sprint D3 (S5b Phase 3): Browser Push Channel
  Foundation: WebPushSubscription schema, VAPID key management
  Impl:       web-push library, Service Worker, stale subscription handling
```

The design spec establishes why this ordering matters: the Status History Timeline (E1.2) is the only UI proof that `JobStatusChanged` events fire — and those events are the primary trigger for D2/D3 templates. Sprint E is a prerequisite for testable Sprint D. The sessions are ordered correctly.

---

## Rising Action: The Analysis

### Dimension 1 — Structural Completeness vs. S4 Template

S4 is the reference template. It uses a four-phase structure: PLAN → DO → CHECK → ACT. S5a and S5b collapse PLAN and DO into direct phase execution, which is appropriate given that the design spec pre-answers the planning questions S4 was resolving. That is not a deficit.

What is a deficit is the following structural comparison:

```
STRUCTURAL COVERAGE HEATMAP
============================================================
Section                          S4       S5a      S5b
------------------------------------------------------------
Context Load (read files)        FULL     FULL     FULL
Quick-Verify (build/test gate)   FULL     FULL     FULL
Deferred Items handling          FULL     FULL     FULL
Phase breakdown with files       FULL     FULL     FULL
UX-Pflicht checklist             FULL     FULL     FULL
Test-Pflicht (unit + E2E)        FULL     PARTIAL  PARTIAL
Foundation-then-Fan-Out          FULL     FULL     FULL
Build serialization rules        FULL     FULL     FULL
VERBOTEN / ERLAUBT main-agent    FULL     FULL     FULL
ANTI-FAULHEIT rules              FULL     FULL     FULL
PFLICHT-CHECKPOINTS              FULL     FULL     FULL
Skill invocations as CPs         FULL     FULL     FULL
Three-Stage Analysis             FULL     FULL     FULL
Flashlight Analysis              FULL     FULL     FULL
Cross-Dependency Check           FULL     PARTIAL  PARTIAL
Architecture Evolution Notes     FULL     ABSENT   ABSENT
Allium Spec update mandate       FULL     PARTIAL  PARTIAL
Rollback Strategy                N/A      ABSENT   ABSENT
E2E Conventions reminder         FULL     FULL     FULL
Exit Checklist                   FULL     FULL     FULL
============================================================
FULL = complete coverage  PARTIAL = mentioned but underspecified
ABSENT = not present
```

**Three sections are absent in both S5 prompts that S4 includes:**

1. **Architecture Evolution Notes.** S4 explicitly documents the DDD principles governing the implementation (Manifest-Driven, Shared-Client-Pattern, Module Lifecycle). S5a references the Channel-Abstraktion refactoring of `notification-dispatcher.ts` inline in Phase 3, but neither prompt contains a dedicated section describing the target architecture the channel abstraction should produce. An agent implementing the ChannelRouter without architectural guidance has wide latitude to produce something that does not compose with D2 and D3.

2. **Rollback Strategy.** The design spec includes a rollback strategy section (session branches, merge-only-when-criteria-met, notification-dispatcher breakpoint). Neither S5a nor S5b carries this. It exists in the spec but was not transferred to the prompts. An agent does not read the spec unless told to; the spec is referenced at the top of each prompt but the rollback rules are not included.

3. **Allium Spec update mandate (partial gap).** S5a mandates updating `notification-dispatch.allium` with Webhook rules and `event-bus.allium` with missing events. S5b mandates a final weed pass. What is missing: neither prompt specifies that a *new* spec file may be required for the Email and Push channels if they introduce domain rules not covered by the existing `notification-dispatch.allium`. The spec evolution path is implicit, not explicit.

---

### Dimension 2 — Checkpoint Coverage

Every deliverable should map to at least one PFLICHT-CHECKPOINT. Here is the complete mapping:

```
CHECKPOINT COVERAGE MAP — S5a (21 CPs: CP-0 through CP-20)
=============================================================
Deliverable                           Covered By     Gap?
-------------------------------------------------------------
Deferred items read                   CP-0           NO
E1.1 Enrichment Panel (4 Actions)     CP-1           NO
E1.2 Status Timeline                  CP-2           NO
E1.3 Kanban reorder                   CP-3           NO
E1.4 Sidebar link                     CP-4           NO
E2.1 Funnel Widget                    CP-5           NO
E2.2 Health Check Button              CP-6           NO
E2.3 Ctrl+Z Undo                      CP-7           NO
E2.4 Retention Cleanup                CP-8           NO
Webhook foundation (schema+types)     CP-9           NO
Webhook full impl (HMAC+retry+UI)     CP-10          NO
notification-dispatch.allium update   CP-11          NO
Comprehensive Review                  CP-12          NO
WCAG Audit                            CP-13          NO
Interaction Design                    CP-14          NO
Data Storytelling (E2.1 Funnel)       CP-15          NO
Allium Weed                           CP-16          NO
Three-Stage Analysis                  CP-17          NO
All Findings Fixed                    CP-18          NO
Zero-Regression Re-Review             CP-19          NO
Exit Checklist Complete               CP-20          NO
-------------------------------------------------------------
ChannelRouter architecture verified   NONE           YES *
event-bus.allium missing events fixed NONE           YES *
SSRF validator tested (unit)          CP-9 partial   YES *
-------------------------------------------------------------
* = gap identified — see Risk Matrix

CHECKPOINT COVERAGE MAP — S5b (21 CPs: CP-0 through CP-20)
=============================================================
Deliverable                           Covered By     Gap?
-------------------------------------------------------------
Deferred items read                   CP-0           NO
job_status_changed in enum            CP-1           NO
dispatcher subscribed to JobStatus    CP-2           NO
tsc --noEmit = 0 after foundation     CP-3           NO
nodemailer SMTP functional            CP-4           NO
Templates all types × 4 locales      CP-5           NO
SMTP Settings UI                      CP-6           NO
EmailChannel in dispatcher            CP-7           NO
WebPushSubscription schema            CP-8           NO
Service Worker registered + working   CP-9           NO
PushChannel in dispatcher             CP-10          NO
Push Settings UI                      CP-11          NO
Comprehensive Review                  CP-12          NO
WCAG Audit                            CP-13          NO
Interaction Design                    CP-14          NO
Data Storytelling (CP-15)             CP-15          NO *
Allium Weed (all 4 channels)          CP-16          NO
Three-Stage Analysis                  CP-17          NO
All Findings Fixed                    CP-18          NO
Zero-Regression Re-Review             CP-19          NO
Exit Checklist                        CP-20          NO
-------------------------------------------------------------
VAPID key rotation warning verified   NONE           YES *
SMTP rate-limit unit test             NONE           YES *
Push 410 Gone handling tested         NONE           YES *
Stale subscription cleanup verified   NONE           YES *
-------------------------------------------------------------
* CP-15 data-storytelling has no obvious S5b deliverable it
  covers (no new dashboard component). The CP exists in S5b
  as a carry-over from S5a's template without a target.
```

**Summary:** S5a has 3 checkpoint gaps (ChannelRouter architecture verification, event-bus.allium fix verification, SSRF unit test gate). S5b has 4 checkpoint gaps (VAPID rotation test, SMTP rate-limit test, 410 Gone handler test, stale cleanup verification) and one orphan checkpoint (CP-15 data-storytelling with no clear S5b target).

---

### Dimension 3 — Skill Invocation Coverage

```
SKILL COVERAGE MATRIX
=============================================================
Skill                                   Spec    S5a     S5b
-------------------------------------------------------------
allium:elicit                           NO      NO      NO
allium:weed                             YES     CP-16   CP-16
comprehensive-review:full-review        YES     CP-12   CP-12
agent-teams:multi-reviewer-patterns     YES     CP-12   CP-12
accessibility-compliance:wcag-audit     YES     CP-13   CP-13
accessibility-compliance:screen-reader  YES     Stage1  Stage1
ui-design:interaction-design            YES     CP-14   CP-14
ui-design:design-review                 YES     Stage1  Stage1
business-analytics:data-storytelling    YES     CP-15   CP-15
pr-review-toolkit:silent-failure-hunter YES     Stage1  Stage1
pr-review-toolkit:pr-test-analyzer      YES     Stage2  Stage2
developer-essentials:error-handling     YES     Stage1  Stage1
security-scanning:stride-analysis       YES     Stage2  Stage2
application-performance:optimization    YES     Stage2  Stage2
agent-teams:parallel-debugging          YES     Stage3  Stage3
superpowers:systematic-debugging        YES     Stage3  Stage3
documentation-generation:docs-architect YES     ACT     ACT
database-design:postgresql              S4 only N/A     N/A
full-stack-orchestration:full-stack     S4 only N/A     N/A
-------------------------------------------------------------
ABSENT from design spec, present in S4:
  /allium:elicit                        -- S4 PLAN phase only
  /database-design:postgresql           -- S4 PLAN phase only
=============================================================
```

All skills referenced in the design spec's Cross-Cutting rules section are present in both S5a and S5b. No skill is missing from either prompt that the spec requires. The two skills absent from S5 (`allium:elicit`, `database-design`) were S4-specific planning tools not needed when a design spec already exists.

One observation: `/business-analytics:data-storytelling` at CP-15 is well-motivated in S5a (the Status Funnel Widget at E2.1 is a conversion chart). In S5b, CP-15 invokes the same skill but there is no analogous new data visualization. The skill will be invoked against already-existing work. This is harmless but creates agent confusion about what the skill is reviewing.

---

### Dimension 4 — Error Risk Scoring by Phase

Scoring methodology:
- **Complexity (1-5):** Architectural novelty, number of moving parts
- **File surface (1-5):** Number of files touched, probability of conflict
- **Historical failure rate (1-5):** Based on patterns from S1-S4 documented in session learnings

```
RISK MATRIX PER PHASE
=============================================================
Phase    Name                    Complex  Files  History  SCORE
-------------------------------------------------------------
E1       Critical UI Gaps          3        3       2      2.7
E2       Backend Exposed           2        3       2      2.3
D1       Webhook Channel           4        4       4      4.0
D2       E-Mail Channel            4        4       3      3.7
D3       Browser Push Channel      5        4       3      4.0
-------------------------------------------------------------
Score = weighted average (complexity ×0.4, files ×0.3, history ×0.3)
Scale: 1=minimal risk, 5=high risk of agent failure

RISK DETAIL — E1 (2.7 / MODERATE):
  + Agents are well-scoped (no file-ownership overlap defined)
  - E1.1 requires reading existing enrichment actions before building
    UI (explicitly noted). Risk: agent skips research, builds against
    assumed API that differs from actual implementation.
  - E1.3 Kanban reorder has a documented architectural decision
    (switch from getJobsList to getKanbanBoard). Agent may take
    option (b) instead of recommended option (a) — wrong choice
    propagates to S5b's E2E tests.

RISK DETAIL — E2 (2.3 / LOW-MODERATE):
  + Small-scoped tasks with clear file ownership
  - E2.3 Ctrl+Z: the prompt distinguishes undoLastAction from
    undoAction (token-based). If agent confuses them, the feature
    conflicts with BulkActionBar. The distinction is mentioned once;
    it should be a checkpoint.
  - E2.1 Funnel Widget: getStatusDistribution consumer — no
    specification of the expected data shape. Agent will infer.

RISK DETAIL — D1 (4.0 / HIGH):
  + Foundation-then-Fan-Out pattern specified correctly
  + SSRF validator scope is explicit
  - CRITICAL: notification-dispatcher.ts refactoring (step 9 of
    the implementation list) is described in text but is NOT a
    checkpoint. CP-9 only verifies "schema + types". The
    ChannelRouter refactor is the highest-complexity step and
    has zero checkpoint coverage.
  - HMAC signing must happen before dispatch, decrypt before sign.
    The encryption/decryption cycle with existing AES pattern is not
    tested at a gate — CP-10 covers "HMAC + Retry + Settings UI +
    Channel-Integration" as one bundle. A fabrication-prone agent
    can claim all four are done when only the first two are.
  - Retry-Exhaustion (auto-deactivate after 5 consecutive failures)
    requires state persistence across retries. No specification of
    where this counter is stored — the prompt says "auto-deactivate"
    but does not say "store consecutiveFailureCount in
    WebhookEndpoint or a separate DeliveryLog". Agent will invent.
  - event-bus.allium missing events (JobStatusChanged,
    CompanyCreated, EnrichmentCompleted, EnrichmentFailed) are
    mentioned in step 10 of the implementation list but there is no
    CP that gates their addition before Phase 3 begins.

RISK DETAIL — D2 (3.7 / HIGH):
  + Online research mandate for nodemailer is explicit
  + TLS enforcement and rate limits are specified numerically
  - CRITICAL: The SMTP password storage decision is ambiguous.
    The prompt says "SMTP Settings in UserSettings or eigene Tabelle".
    Two parallel agents (Schema agent and Settings UI agent) will
    make different assumptions about whether a new table exists or
    SMTP fields were added to UserSettings. This causes Prisma type
    mismatch.
  - E-mail templates for ALL existing NotificationType values is
    required (9 types × 4 locales = 36 templates minimum). The prompt
    lists existing types once. No verification that the agent has
    enumerated all of them before starting template generation.
  - Test-Pflicht specifies "Snapshot-Tests für alle Templates × 4
    Locales" but there is no CP gating template completeness before
    Channel-Integration agent starts. If the template agent produces
    7 of 9 types, the channel integration will fail at runtime for
    the missing 2.

RISK DETAIL — D3 (4.0 / HIGH):
  + online research mandate for web-push explicit
  + VAPID key naming collision documented (WebPushSubscription NOT
    PushSubscription)
  - CRITICAL: Service Worker scope conflict. public/sw-push.js is a
    push-only service worker. The prompt says "NOT full PWA" but
    does not address what happens if a Next.js PWA plugin or an
    existing sw.js is present. No discovery step for existing service
    workers. If there is a conflict, the Registration agent will
    produce silent runtime failures.
  - VAPID key storage decision is underspecified: "stored encrypted
    in separater DB-Tabelle VapidConfig oder als JSON-Feld in
    UserSettings". Both the Push Channel agent and the Service
    Worker agent need to know which approach was chosen. With
    Foundation-then-Fan-Out this is resolved if the Foundation agent
    makes and commits the decision — but it is not stated as a
    required decision output.
  - Stale subscription handling (410 Gone → delete) is a runtime
    event. No E2E test spec for this path. No CP verifies it was
    implemented. It will be invisible to checklist verification.
=============================================================
```

---

### Dimension 5 — Dependency Chain Integrity

```
S5a DEPENDENCY CHAIN
=============================================================

[E1.4 Sidebar Link] -- sequential first, no dependencies
       |
       v
[E1.1 Enrichment Panel] --+
[E1.2 Status Timeline]    |  parallel, no file overlap
[E1.3 Kanban Reorder]   --+
       |
       v
[E2.1 Funnel Widget]    --+
[E2.2 Health Check]       |  parallel, no file overlap
[E2.3 Ctrl+Z Undo]        |
[E2.4 Retention UI]     --+
       |
       v
[D1 Foundation]  -- sequential (Schema + Types + tsc gate)
       |
       v
[D1 HMAC+Retry]    --+
[D1 Settings UI]     |  parallel
[D1 Channel Integ] --+
       |
       v
[CHECK Phase] → [ACT Phase]

HIDDEN SEQUENTIAL DEPENDENCIES (not explicit in prompt):
---------------------------------------------------------------
E1.3 Kanban → E2.1 Funnel: If E1.3 switches from getJobsList to
  getKanbanBoard per the recommendation, the data shape changes.
  E2.1 uses getStatusDistribution (separate action, no dependency).
  No actual hidden dependency here — independent.

E1.2 Timeline → D1 Channel Integration: Status History Timeline
  (E1.2) must render JobStatusChanged events. D1 Channel Integration
  subscribes the dispatcher to those events. If E1.2 agent reads
  the Timeline before the dispatcher subscription exists, the agent
  may conclude events are not firing and introduce a workaround.
  RESOLUTION: The dispatcher subscription in D1 Phase 3 Step 3 is
  the authoritative subscriber. E1.2 only READS history, it does
  not depend on the subscription. No actual hidden dependency.

D1 ChannelRouter refactor → ALL future channel integrations:
  CRITICAL HIDDEN DEPENDENCY. The ChannelRouter refactor in D1
  (step 9 of Phase 3) restructures notification-dispatcher.ts.
  D1 Phase 3 parallel agents (HMAC+Retry, Settings UI, Channel
  Integration) all touch this same dispatcher. The Channel
  Integration agent must apply the ChannelRouter refactor FIRST
  before the other two finish. The prompt assigns Channel-
  Integration as one of three PARALLEL agents. This means the
  HMAC+Retry agent and the Settings UI agent are coding against
  a dispatcher that is being structurally refactored simultaneously.

  THIS IS A SEQUENCING VIOLATION IN THE CURRENT PROMPT DESIGN.

  The ChannelRouter refactor should be in the Foundation step
  (Schritt 1, SEQUENTIAL), not in Schritt 2 (PARALLEL).

=============================================================

S5b DEPENDENCY CHAIN
=============================================================

[S5a Handoff] -- assumed: Webhook functional, ChannelRouter in place
       |
       v
[D2/D3 Foundation] -- sequential (enum + dispatcher subscription)
       |
       v
[D2 SMTP Foundation] -- sequential (Schema decision + types)
       |
       v
[D2 nodemailer]    --+
[D2 Templates]       |  parallel
[D2 Settings UI]     |
[D2 Channel Integ] --+
       |
       v
[D3 Push Foundation] -- sequential (schema + SW)
       |
       v
[D3 web-push]      --+
[D3 Settings UI]     |  parallel
[D3 SW Registration] +
       |
       v
[CHECK Phase] → [ACT Phase]

HIDDEN SEQUENTIAL DEPENDENCIES:
---------------------------------------------------------------
D2 Templates ← D2 Schema decision: Template agent needs to know
  the SMTP schema structure (UserSettings vs. new table) to generate
  test fixtures. If the Schema agent does not output a clear decision
  document before parallelizing, the Template agent will infer.

D3 web-push ← VAPID Key storage decision: The web-push library
  integration requires reading VAPID keys from wherever they are
  stored. If the Foundation agent does not commit the schema and
  emit a decision, the web-push agent will guess.

D2 Channel Integration ← D1 ChannelRouter: S5b assumes S5a's
  ChannelRouter is stable. If S5a's ChannelRouter has design debt
  (because the refactor happened in a parallel agent), S5b's D2
  agent will build on a shaky foundation. This is the primary
  cross-session hidden dependency.
=============================================================
```

---

## Climax: The Key Insight

The ChannelRouter refactor in D1 Phase 3 is assigned to a parallel agent alongside HMAC+Retry and Settings UI. This is structurally wrong.

The ChannelRouter refactor changes the fundamental architecture of `notification-dispatcher.ts` from a single-channel monolith to a routed multi-channel system. Every other parallel agent in D1's Schritt 2 writes code that calls into this dispatcher. If the HMAC+Retry agent starts before the ChannelRouter refactor is committed, it will write against the old architecture. When the Channel-Integration agent commits the refactor, the HMAC+Retry agent's work will have type errors or behavioral conflicts.

This is exactly the pattern that caused cascading build failures in S3 — parallel agents writing against types that don't exist yet. The S4 and S5a prompts document this as "Foundation-then-Fan-Out" and apply it correctly to Prisma schema changes. But they do not apply it to the ChannelRouter refactor, which is an equally foundational change.

The fix is a four-line change to S5a's Phase 3 orchestration: move the ChannelRouter refactor (`shouldNotify()` channel-aware, `NotificationPreferences` interface extension, ChannelRouter class) from Schritt 2/Agent 3 into Schritt 1, SEQUENTIALLY, after the Prisma schema but before parallelization.

Everything else in the prompts is strong. This one gap carries the highest probability of cascading failure.

---

## Resolution: Top 5 Risks Ranked by Impact x Probability

```
RISK REGISTER — Top 5 by Impact x Probability
=============================================================
Rank  Risk                         Impact  Prob  Score  Session
---------------------------------------------------------------------
 1    ChannelRouter refactor in     5       4     20     S5a
      parallel agent causes type
      conflicts in HMAC+Retry agent
      and Settings UI agent

 2    SMTP schema ambiguity         4       4     16     S5b
      (UserSettings vs. new table)
      splits Schema agent and UI
      agent into incompatible paths

 3    Service Worker conflict        4       3     12     S5b
      (existing sw.js or Next.js
      PWA plugin) causes silent
      push registration failure

 4    Template completeness gap:     3       4     12     S5b
      Templates × 4 locales × 9
      types — agent covers partial
      set, Channel Integration
      fails at runtime for omitted
      types

 5    event-bus.allium missing       3       3      9     S5a
      events added without a CP
      gate; agent skips or
      fabricates; allium:weed
      finds divergence late

Scale: Impact 1-5 (5=session-blocking), Probability 1-5 (5=likely)
```

---

## Handoff Integrity: S5a → S5b

```
S5b ASSUMPTION AUDIT
=============================================================
S5b Assumes                          S5a Delivers?    Risk
-------------------------------------------------------------
Webhook functional                   Yes (CP-10)      LOW
ChannelRouter in dispatcher          WEAK — CP-10     MEDIUM
  (channel-agnostic)                 bundles this
                                     with 3 other
                                     items; may be
                                     fabricated
notification-dispatch.allium has     Yes (CP-11)      LOW
  Webhook rules
NotificationPreferences has          Described in     MEDIUM
  webhook: boolean field             step 9; not
                                     independently
                                     verified
shouldNotify() is channel-aware      Described in     MEDIUM
  (not single-gate)                  step 9; no CP
                                     isolates this
Build green + tests green            Yes (Exit        LOW
                                     Checklist)
=============================================================

VERDICT: S5b's three MEDIUM-risk assumptions all relate to the
ChannelRouter refactor. If S5a's agent bundles the refactor
with other items and fabricates completion (67% fabrication
rate from S2), S5b will discover the issue only when the D2
Channel Integration agent tries to add an EmailChannel adapter
to a dispatcher that is still single-channel.
```

---

## Specific Recommendations

The following are ordered by priority. Items 1-4 are blocking. Items 5-8 are improvements.

### Blocking (must fix before execution)

**Recommendation 1 — Split ChannelRouter into Foundation (S5a)**

In S5a Phase 3, move the following from Schritt 2/Agent 3 into Schritt 1 (SEQUENTIAL, after Prisma schema):

- Refactor `notification-dispatcher.ts` to `ChannelRouter` pattern
- Make `shouldNotify()` channel-aware per channel (not single-gate)
- Extend `NotificationPreferences` interface: `channels: { inApp, webhook }`
- Update `DEFAULT_NOTIFICATION_PREFERENCES`

Add a new CP between current CP-9 and CP-10:
> `CP-9b: ChannelRouter committed — shouldNotify() is channel-aware, NotificationPreferences has webhook field — tsc --noEmit = 0`

Then Schritt 2 (PARALLEL) becomes: HMAC+Retry (Agent 1), Settings UI (Agent 2), allium spec update (Agent 3). No agent touches dispatcher architecture.

**Recommendation 2 — Resolve SMTP Schema Ambiguity (S5b)**

Change S5b's D2 Foundation Step 1 from:

> "Prisma: SMTP-Settings in UserSettings oder eigene Tabelle"

to an explicit decision:

> "Prisma: Neue Tabelle `SmtpConfig` (id, userId, host, port, username, passwordEncrypted, fromAddress, enabled, timestamps) mit @@unique([userId]) — ein Datensatz pro User. NICHT in UserSettings — hält Settings-Model kompakt und erlaubt später SMTP-Profil-Feature."

This eliminates the schema ambiguity before agents parallelise.

**Recommendation 3 — Add Service Worker Discovery Step (S5b)**

Before S5b D3 Foundation Schritt 1, add a mandatory discovery command:

```bash
ls public/sw*.js 2>/dev/null || echo "no service workers found"
grep -r "serviceWorker" src/ --include="*.ts" --include="*.tsx" -l 2>/dev/null
```

If an existing service worker is found, the Foundation agent must evaluate the conflict before creating `public/sw-push.js`.

**Recommendation 4 — Add CP for event-bus.allium Fix (S5a)**

The spec-code divergence in `event-bus.allium` (missing: `JobStatusChanged`, `CompanyCreated`, `EnrichmentCompleted`, `EnrichmentFailed`) is mentioned only in implementation step 10. Add:

> `CP-9c: event-bus.allium updated — all 4 missing events present — allium:weed against event-bus.allium = zero divergences`

This gates the fix before the CHECK phase, not as a surprise for allium:weed.

### Improvements (should fix before execution)

**Recommendation 5 — Isolate Ctrl+Z Undo Distinction (S5a)**

E2.3 distinguishes `undoLastAction` from `undoAction(token)`. This is mentioned in the prompt and in the design spec notes. Add to CP-7:

> `CP-7: E2.3 Ctrl+Z — git diff shows undoLastAction (NOT undoAction) in keyboard listener — grep confirms undoAction(token) in BulkActionBar unchanged`

**Recommendation 6 — Enumerate Templates Explicitly (S5b)**

Replace the implicit list in S5b D2 with an explicit count:

> "Templates PFLICHT für alle 9 existierenden NotificationType-Werte (module_deactivated, cb_escalation, consecutive_failures, auth_failure, vacancy_promoted, vacancy_batch_staged, bulk_action_completed, retention_completed, job_status_changed) × 4 Locales (EN, DE, FR, ES) = 36 Templates. Zähle vor CP-5."

**Recommendation 7 — Add CP-15 Target in S5b**

CP-15 (data-storytelling) in S5b has no clear target. Either remove it from S5b (the skill was already invoked in S5a for the Funnel Widget) or redirect it:

> "CP-15: Rufe /business-analytics:data-storytelling auf für Notification-Metriken-Übersicht (welcher Channel hat wie viele Deliveries, welche NotificationType wird am häufigsten getriggert). Evidenz: Skill-Output + Visualisierung."

This gives the skill a concrete S5b deliverable.

**Recommendation 8 — Add VAPID Decision to Foundation Output (S5b)**

In S5b D3 Foundation Schritt 1, require the agent to output a decision file:

> "Commit Foundation. In der Commit-Message dokumentiere VAPID-Storage-Entscheidung: 'VAPID keys stored in VapidConfig table' ODER 'VAPID keys stored as JSON in UserSettings'. Alle nachfolgenden Agents lesen diese Entscheidung aus dem letzten Commit-Message."

This creates a traceable decision that parallel agents can read without conflicting assumptions.

---

## Call to Action: Ready or Not?

```
SESSION READINESS ASSESSMENT
=============================================================
                   S5a          S5b
-------------------------------------------------------------
Structural         GOOD         GOOD
Checkpoints        GOOD         GOOD
Skill Coverage     COMPLETE     COMPLETE
Dependency Chain   ONE GAP      DEPENDS ON S5a FIX
Handoff Integrity  N/A          CONDITIONAL
Error Risk (avg)   3.2/5        3.9/5
-------------------------------------------------------------
VERDICT:
  S5a: NOT READY — fix Recommendation 1 + 4 before running
  S5b: NOT READY — fix Recommendation 2 + 3 + depends on S5a
=============================================================
```

S5a requires two targeted changes before execution: the ChannelRouter refactor must move into the sequential Foundation step (Recommendation 1), and the `event-bus.allium` gap needs a standalone CP gate (Recommendation 4). These are prompt edits, not re-architecture. Estimated edit time: 15 minutes.

S5b requires one decision (SMTP schema, Recommendation 2) and one discovery step (Service Worker, Recommendation 3). Both are also prompt edits. Estimated edit time: 10 minutes.

Once those four blocking changes are applied, the sessions are strong. The three-stage analysis, the 67% fabrication verification protocol, the file-ownership segregation for parallel agents, and the build serialization rules all reflect hard-won operational learning from S1 through S4. The checkpoint density is sufficient. The skill coverage is complete.

Do the 25 minutes of prompt surgery. Then run.

---

*This report was produced by pre-flight analysis of session prompts S5a and S5b against the S4 template, the 2026-04-03 design spec, and accumulated session learnings from S1a through S4. It does not execute any code, run any build, or inspect the codebase state. It analyzes prompt design only. Runtime state verification remains the responsibility of the Quick-Verify step at the top of each session prompt.*
