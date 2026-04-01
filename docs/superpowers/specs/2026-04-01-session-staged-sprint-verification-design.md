# Session-Staged Sprint Verification & Completion — Design Spec

## Problem Statement

Sprint A (Architecture Debt, 10 items) and Sprint B (UX/UI Gaps, 10 items) were executed automatically via shell scripts and reported as DONE — but never independently verified. Sprint C Tracks 1-3 (Public API, Blacklist, Caching, JobDeck) are on main with security review. Sprint C5 (CRM Core) and C6 (Data Enrichment) remain open.

The 4-stage plan in `swift-knitting-stonebraker.md` is too large for a single Claude Code session. This spec defines how to split it into self-contained sessions with clear handoff artifacts.

Additionally, three cross-cutting concerns need standardization:
1. Allium spec-code alignment as a recurring PDCA check
2. Performance fixes as a standard step (3 open HIGH findings)
3. User Journey + UX completeness verification methodology

## Prerequisites

### Required Skills/Superpowers

All session prompts assume these skills are available in the Claude Code environment:

| Skill | Used In | Fallback If Unavailable |
|-------|---------|------------------------|
| `allium:weed` | S1a, S3, S4 | Manual code-vs-spec comparison by reading both files |
| `allium:elicit` | S3, S4 | Write `.allium` spec manually following existing spec patterns |
| `/comprehensive-review:full-review` | S1b, S3, S4 | Spawn individual review agents: `code-reviewer`, `security-auditor`, `performance-engineer`, `test-automator` |
| `/ui-design:design-review` | S2, S3 | Manual review against UX 10-Point Checklist |
| `/ui-design:accessibility-audit` | S2 | Manual WCAG check using checklist from `ui-design:accessibility-compliance` |
| `/ui-design:create-component` | S3 | Design components in text, review with user before implementing |
| `/full-stack-orchestration:full-stack-feature` | S3, S4 | Manual PDCA: plan → implement → test → review cycle |
| `/agent-teams:team-spawn` | All | Use sequential execution instead of parallel agents |

## Current State

- **19 Allium Specs** (~8400 lines), 114+ unit tests, 68 E2E green, 96 security bugs fixed
- **Sprint A:** 1 commit (1815c1e) — all 10 items in one commit, ~8 files changed
- **Sprint B:** Multiple commits (B1-B10) with 3 review rounds already applied
- **Sprint C Tracks 1-3:** On main, security-reviewed (25+ vulns fixed, ADR-015 to ADR-019)
- **Sprint C5 (CRM Core):** Open — Job Status Workflow (5.3) + Kanban Board (5.6)
- **Sprint C6 (Data Enrichment):** Open — Logo + Deep-Link modules (1.13)
- **3 Performance Findings:** lastUsedAt throttling, unbounded Job-URL query, rate limiter memory

## Chosen Approach: Hybrid (Review+Fix Bundled, Features Separate)

### Why This Approach

- **Context preservation:** Review and fix in the same session means the agent that finds a bug also fixes it — no "why" gets lost in handoff.
- **Allium Weed first:** Spec-code divergences are the deepest bugs. Running weed before comprehensive review filters noise: many "findings" are actually already-specified behaviors.
- **Performance fixes in S1a:** The 3 open findings affect existing foundation code (auth.ts, runner.ts, rate-limit.ts). Fixing them before building new features prevents S3/S4 from building on problematic code.
- **User Journeys as own session:** UX completeness requires focused attention across all features — mixing it with verification or feature work dilutes both.

## Session Architecture

```
S1a: Allium Weed + Gap Analysis + Perf Fixes ──[gap-report.md, BUGS.md]──►
S1b: Comprehensive Review + Fix All ──[BUGS.md, ROADMAP.md, Build green]──►
S2:  User Journeys & UX Polish ──[user-journey-audit.md, E2E increased]──►
S3:  CRM Core (C5) ──[5.3+5.6 DONE, Allium Spec, E2E]──►
S4:  Data Enrichment (C6) ──[1.13 Phase 1 DONE, Allium Spec]
```

**Dependency note:** S3 and S4 are independent of each other — they touch different code areas (CRM domain vs. Connector/Enrichment domain). They could theoretically run in parallel on separate branches if needed. However, sequential execution is recommended because S3 may establish patterns (e.g., Domain Events) that S4 should follow.

### Session Prompt Structure

Every session prompt follows this template:

1. **Context-Load:** Which files to read (CLAUDE.md, Memories, ROADMAP, Masterplan)
2. **Quick-Verify:** Validate previous session's handoff artifacts (skip for S1a)
3. **Context Paragraph:** What has happened so far
4. **Assignment:** Exactly what to do
5. **Cross-Cutting Rules:** PDCA, Zero Tolerance, Git, Team Orchestration
6. **Exit Checklist:** What handoff artifacts to produce

### Handoff Strategy

Each session produces standardized handoff artifacts:

1. **ROADMAP.md** (`docs/ROADMAP.md`) — updated status markers
2. **docs/BUGS.md** — all known issues (fixed + open), with severity and file reference
3. **CHANGELOG.md** (project root) — entries in format: `## [YYYY-MM-DD] Session SN — Title` with bullet points per change, grouped by type (Added/Changed/Fixed)
4. **Git Commits** — logically grouped, conventional commits
5. **Build + Tests green** — verified as last action

**Definition of "green":** Build green means `source scripts/env.sh && bun run build` exits with code 0 and zero TypeScript errors. Tests green means `bash scripts/test.sh --no-coverage` exits with code 0. E2E green means `nice -n 10 npx playwright test --project=chromium --workers=1` passes all tests.

**Quick-Verify Protocol (start of each follow-up session):**

```bash
# Step 1: What did previous session do?
git log --oneline -10

# Step 2: Build still green?
source scripts/env.sh && bun run build

# Step 3: Tests still green?
bash scripts/test.sh --no-coverage

# Step 4: Establish E2E baseline
E2E_BASELINE=$(npx playwright test --list 2>/dev/null | grep -c "test")
echo "E2E baseline: $E2E_BASELINE tests"

# Step 5: Check known issues
# Read docs/BUGS.md — any open issues?
# Read ROADMAP.md — status correct?

# Decision:
# If all green → proceed with session assignment
# If build/test red → check docs/BUGS.md for known issues, attempt targeted fix
# If unfixable within 15 min → document in BUGS.md and proceed with own scope
```

## Failure Modes & Rollback Strategy

### Branch Strategy

Each session works on a dedicated branch:
- **S1a:** `session/s1a-allium-gap-perf`
- **S1b:** `session/s1b-comprehensive-review`
- **S2:** `session/s2-ux-journeys`
- **S3:** `session/s3-crm-core`
- **S4:** `session/s4-data-enrichment`

Merge to `main` ONLY when all exit criteria are met. If a session ends incomplete, the branch preserves partial work for the next session.

### Partial Completion

If a session runs out of context before completing all work:
1. **Commit all completed work** to the session branch
2. **Update docs/BUGS.md** with remaining items as open issues
3. **Write a handoff note** in the last commit message: what's done, what's left
4. The next session starts by reading the branch's `docs/BUGS.md` and continuing

### Build Breakage at Session Start

If Quick-Verify finds the build broken:
1. Read `docs/BUGS.md` for known issues from previous session
2. Check `git log --oneline -5` for recent changes that may have caused the break
3. Attempt targeted fix (max 15 minutes)
4. If unfixable: document in `docs/BUGS.md`, merge previous session's branch excluding the broken commit, and proceed

### Context Exhaustion Mid-Session

If the agent detects it's running low on context:
1. Prioritize: commit completed work, update BUGS.md, produce partial handoff
2. Do NOT start new fix cycles or reviews — close out cleanly
3. The next session picks up where this one left off

---

## Session S1a: Allium Weed + Gap Analysis + Performance Fixes

### Scope

Run spec-code alignment over all 19 Allium specs. Verify Sprint A+B+C items against Masterplan. Fix 3 open performance issues. This is the foundation session — it ensures the codebase is spec-aligned and performance-sound before deeper review.

### Steps

0. **Read docs/BUGS.md** to understand known issues from prior work.

1. **Allium Weed (all 19 specs):**
   - Run `allium:weed` over every `.allium` file in `specs/`
   - Fix all spec-code divergences
   - This must happen BEFORE the comprehensive review (S1b) to reduce noise

2. **Gap Analysis (A1-A10, B1-B10, C1-C4 against Masterplan):**
   - Compare each item against its description in `open-architecture-masterplan.md`
   - Verify the implementation matches the spec — not just "file exists" but "behavior correct"
   - Produce a gap report in `docs/gap-analysis-sprint-abc.md`: item → status (DONE/PARTIAL/MISSING) → what's missing
   - Fix any PARTIAL or MISSING items

3. **Performance Fixes (3 open HIGH findings):**
   - **lastUsedAt Throttling (auth.ts, credential-resolver.ts, api-key-resolver.ts):** Throttle to max 1 write per 5 minutes per key. Use in-memory timestamp map.
   - **Unbounded Job-URL Query (runner.ts):** Limit dedup query to active automations or time window (e.g., last 90 days).
   - **Rate Limiter Memory (rate-limit.ts):** Ensure LRU/TTL cleanup covers all entries, not just empty ones (A2 partially fixed this).

### Exit Criteria

- All 19 Allium specs pass `allium:weed` (zero divergences)
- Gap analysis complete: `docs/gap-analysis-sprint-abc.md` written, all items confirmed DONE
- 3 performance fixes committed and tested
- Build green, unit tests green
- BUGS.md updated with any new issues found
- Session branch merged to main. S1b branches from main after merge.

---

## Session S1b: Comprehensive Review + Fix All Findings

### Scope

Run 5-dimension comprehensive review over all Sprint A+B+C changed files. Fix all findings with zero tolerance. This session builds on S1a's clean spec-aligned, performance-fixed codebase.

### Steps

0. **Quick-Verify S1a handoff:**
   - Run Quick-Verify Protocol
   - Read `docs/gap-analysis-sprint-abc.md` — all items DONE?
   - Read `docs/BUGS.md` — any open issues from S1a?

1. **Comprehensive Review (`/comprehensive-review:full-review`):**
   - **Architecture Review** — aggregate boundaries, DDD patterns, ACL compliance
   - **Security Audit** — IDOR, "use server" exports, rate limiting, credential handling
   - **Performance Review** — unbounded queries, N+1, caching effectiveness
   - **Testing Coverage** — missing tests, edge cases not covered
   - **Best Practices** — TypeScript strictness, error handling, code quality
   - **Scope:** All files changed in Sprint A, B, and C Tracks 1-3
   - **Review boundary:** This session focuses on architecture, security, performance, testing, and code quality. UX/UI dimensions are handled in S2.

2. **Fix ALL findings:**
   - Critical, High, Medium, AND Low — zero tolerance
   - Re-review after fixes to confirm no regressions

### Exit Criteria

- Comprehensive review: zero open findings after fix round
- Build green, unit tests green, E2E green (establish baseline count)
- BUGS.md and ROADMAP.md updated
- CHANGELOG.md entries for all fixes
- Session branch merged to main

---

## Session S2: User Journeys & UX Polish

### Scope

Create user journeys with edge cases for all 8 implemented features. Run UX 10-point checklist on all ~14 new/modified components. Fix everything found. This session focuses exclusively on UX/UI quality — S1b already covered architecture, security, performance, and testing.

### Steps

0. **Quick-Verify S1b handoff:**
   - Run Quick-Verify Protocol
   - Read `docs/BUGS.md` — any open issues from S1b?
   - Establish E2E baseline count

### User Journey Method

For each feature:

1. **Define Happy Path** — primary use case as step-by-step
2. **Derive Edge Cases** from 7 dimensions:
   - Empty inputs / No data
   - Network errors / API unreachable
   - Concurrent access (concurrent mutations)
   - Extreme data volumes (pagination, performance)
   - Mobile vs Desktop (375px)
   - Different locales (DE/EN/FR/ES)
   - External API outages (EURES, ESCO, AI Provider down)
3. **Check implementation** — is the edge case handled in code?
4. **Check tests** — is the edge case tested (unit or E2E)?
5. **Fix missing implementations and tests immediately**

### Feature Scope

| Feature | Type | Journey Depth |
|---------|------|---------------|
| SchedulerStatusBar (B1) | UI Widget | Medium — states, popover, SSE |
| RunProgressPanel (B3) | Live UI | High — SSE, phases, errors |
| ConflictWarning (B2) | Dialog | Low — 2 paths |
| Company Blacklist (C3) | CRUD + Pipeline | Medium — CRUD + filter integration |
| Response Caching (C4) | Infrastructure | Low — invalidation check |
| JobDeck (C1) | Swipe UI | High — touch, keyboard, undo, empty |
| Public API (C2) | REST API | High — auth, rate limit, CRUD, errors |
| API Key Management | CRUD UI | Medium — create, revoke, delete, max limit |

### UX 10-Point Checklist

Applied **per component** (not per feature):

| # | Criterion | Check Method |
|---|-----------|-------------|
| 1 | Loading State | Code review: skeleton/spinner for async data? |
| 2 | Empty State | Code review: helpful message + CTA? |
| 3 | Error State | Code review: toast + retry option? |
| 4 | Mobile (375px) | `/ui-design:design-review` + manual check |
| 5 | Keyboard Nav | Tab order, focus indicator, Enter/Escape |
| 6 | Dark Mode | Contrast check, no hardcoded white/black |
| 7 | i18n | Grep for hardcoded strings, all 4 locales |
| 8 | Confirmation Dialogs | Destructive actions → dialog present? |
| 9 | Feedback | Every action → toast/animation/state change? |
| 10 | Design System | Shadcn/Tailwind pattern consistent? |

### Component Scope

All components created or significantly modified in Sprint A+B+C:
- SchedulerStatusBar, RunProgressPanel, ConflictWarningDialog
- DeckCard, DeckView, ViewModeToggle, StagingContainer
- PublicApiKeySettings, CompanyBlacklistSettings
- RunStatusBadge, AutomationList, ModuleBusyBanner, RunHistoryList

### Additional Reviews

- `/ui-design:design-review` for all Sprint B+C UI components
- `/ui-design:accessibility-audit` for WCAG compliance
- Design system consistency check against Shadcn/Tailwind patterns

### Output Location

User journeys and UX audit results are documented in `docs/user-journey-audit.md` with this structure:

```markdown
# User Journey & UX Audit — Sprint A+B+C

## Feature: [Feature Name]
### Happy Path
1. Step 1...
2. Step 2...

### Edge Cases
| Dimension | Edge Case | Implemented? | Tested? | Fix |
|-----------|-----------|-------------|---------|-----|
| Empty data | No vacancies in staging | Yes | E2E | — |
| Network | SSE connection drops | No | No | Added reconnect logic + test |

## UX Checklist: [Component Name]
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | Missing | Added skeleton |
```

### Exit Criteria

- User journeys documented in `docs/user-journey-audit.md` for all 8 features
- UX 10-point checklist passed for all ~14 components
- All missing edge case implementations fixed
- All missing tests added
- E2E count increased from baseline
- Build green, all tests green
- BUGS.md updated, CHANGELOG.md updated

### Note on Session Priority

S2 is important but lower priority than S1a/S1b (foundation) and S3/S4 (new features). If time is constrained, S2 can be deferred — S3/S4 each include their own User Journey + UX verification in the PDCA Check phase, which partially compensates for new feature UX (but not for existing Sprint A+B+C features). Making this trade-off explicit: skipping S2 means Sprint A+B+C features ship without systematic UX verification.

---

## Session S3: CRM Core (C5)

### Scope

Implement ROADMAP 5.3 (Job Status Workflow) + 5.6 (Kanban Board) using full PDCA cycle.

### Steps

0. **Quick-Verify S2 handoff** (or S1b if S2 was skipped):
   - Run Quick-Verify Protocol
   - Read `docs/BUGS.md` and `docs/user-journey-audit.md` (if exists)

### PDCA Cycle

**Plan:**
1. `allium:elicit` for CRM domain rules:
   - Job Status Workflow: allowed transitions, side effects per transition, notes per transition
   - Kanban Board: column mapping to JobStatus, sorting, drag-and-drop rules
2. ROADMAP deep-dive: cross-dependencies to 5.1 (Communication), 5.4 (Reminders), 5.9 (Timeline), 0.6 (Notifications)
3. UI wireframes FIRST via `/ui-design:create-component` + `/ui-design:design-review`
4. Architecture decisions: choose sustainable path based on DDD, ROADMAP, Allium Specs

**Do:**
1. `/full-stack-orchestration:full-stack-feature` for implementation
2. UX requirements for EVERY new component: Loading, Empty, Error states, Mobile, Keyboard, Dark Mode, i18n, Confirmations, Feedback
3. Commit after each logical step, build + tests before each commit

**Check:**
1. `allium:weed` — verify implementation matches spec
2. `/comprehensive-review:full-review` (all 5 dimensions)
3. User Journey + Edge Case verification for new feature
4. Blind Spot Check
5. Cross-dependency check against ROADMAP

**Act:**
1. Fix ALL findings
2. Re-review after fixes
3. Update ROADMAP.md (5.3, 5.6 as DONE)
4. Update CLAUDE.md (CRM Core architecture section)
5. Update CHANGELOG.md
6. Documentation agents as per `docs/documentation-agents.md`

### Exit Criteria

- Allium spec for CRM domain written and verified
- Job Status Workflow functional with all transitions
- Kanban Board with drag-and-drop, mobile responsive
- Comprehensive review passed (zero findings)
- E2E tests for CRM features
- ROADMAP 5.3 + 5.6 marked DONE
- Build green, all tests green

---

## Session S4: Data Enrichment (C6)

### Scope

Implement ROADMAP 1.13 Phase 1 — Logo modules (Clearbit, Google Favicon) + Deep-Link parsing (Meta/OpenGraph) as new Connector type.

### Steps

0. **Quick-Verify S3 handoff:**
   - Run Quick-Verify Protocol
   - Read `docs/BUGS.md` — any issues from S3?

### PDCA Cycle

Same structure as S3:

**Plan:**
1. `allium:elicit` for Enrichment domain: fallback chains, cache TTL, module interface
2. ROADMAP deep-dive: cross-deps to 2.4 (Logos), 2.2 (Reviews), 3.6 (Link-Parse)
3. Architecture: new `DataEnrichmentConnector` interface following existing Module Lifecycle pattern

**Do:**
1. `/full-stack-orchestration:full-stack-feature`
2. New connector type: `src/lib/connector/data-enrichment/`
3. Module manifests for each enrichment module
4. Fallback chain orchestration (Clearbit → Google Favicon → placeholder)

**Check:**
1. `allium:weed` — spec-code alignment
2. `/comprehensive-review:full-review`
3. User Journey + Edge Cases
4. Blind Spot + Cross-dependency check

**Act:**
1. Fix ALL findings
2. Update ROADMAP, CLAUDE.md, CHANGELOG
3. Documentation

### Exit Criteria

- Allium spec for Data Enrichment domain
- Logo enrichment working with fallback chain
- Link parsing with Meta/OpenGraph extraction
- Integration with Company creation flow
- Comprehensive review passed
- ROADMAP 1.13 Phase 1 marked DONE
- Build green, all tests green

---

## Cross-Cutting: Universal Exit Checklist

Applied at the end of EVERY session (S1a through S4). Items marked with session-specific notes where applicable:

```markdown
### Universal Exit Checklist
- [ ] Allium: Existing specs checked with `allium:weed` (S1a: all 19; S1b: skip; S2: only if code changed; S3/S4: affected specs)
- [ ] Allium: New specs created with `allium:elicit` if complex domain (S3/S4 only)
- [ ] Performance: No unbounded queries, no unthrottled writes introduced
- [ ] Performance: N+1 check for new Prisma queries
- [ ] Blind Spot Check: "What did we not think of?"
- [ ] Security: IDOR ownership, "use server" exports, rate limiting checked
- [ ] User Journey + Edge Case Verification (S2: systematic; S3/S4: for new features)
- [ ] UX/UI 10-Point Checklist (S2: all components; S3/S4: new components)
- [ ] Cross-Dependency Check against ROADMAP
- [ ] docs/BUGS.md updated (new issues + fixed issues)
- [ ] CLAUDE.md updated if architecture changes
- [ ] ROADMAP.md updated (features marked DONE where applicable)
- [ ] CHANGELOG.md entries in format: `## [YYYY-MM-DD] Session SN — Title`
- [ ] Test suite extended (E2E + Unit) where applicable
- [ ] Build + Tests verified with actual command output (evidence before claims)
```

## Cross-Cutting: Allium Spec-Alignment Protocol

### In S1a (One-Time Full Sweep)

Run `allium:weed` over all 19 specs in `specs/`:
- action-result.allium, ai-provider.allium, api-key-management.allium
- auth-session.allium, automation-wizard.allium, base-combobox.allium
- e2e-test-infrastructure.allium, event-bus.allium, i18n-system.allium
- job-aggregate.allium, module-lifecycle.allium, notification-dispatch.allium
- profile-resume.allium, public-api-v1.allium, scheduler-coordination.allium
- security-rules.allium, shared-entities.allium, ui-combobox-keyboard.allium
- vacancy-pipeline.allium

Fix all divergences found.

### In Every PDCA Cycle (S3, S4)

**Plan phase:** Check if Allium spec exists for affected code.
- If yes → plan to run `allium:weed` after changes
- If no, but complex domain → `allium:elicit` for new spec
- If no, simple → skip

**Check phase:** `allium:weed` as last step BEFORE comprehensive review.

### For New Features

`allium:elicit` BEFORE writing any implementation code. The spec is the source of truth for domain rules.

## Cross-Cutting: Team Orchestration Rules

- Use `/agent-teams:team-spawn` and `/agent-teams:team-feature` for parallel work
- `/agent-teams:team-review` for multi-dimension reviews
- `/agent-teams:team-debug` for debugging
- Follow `/agent-teams:team-communication-protocols` and `/agent-teams:team-composition-patterns`
- No more than 2-3 agents on same file set (avoid merge conflicts)

## Cross-Cutting: Git Rules

- Commit frequently (after each logical step)
- Conventional commits with `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + tests BEFORE every commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --no-coverage`
- Never create PRs against upstream Gsync/jobsync
- Each session uses its own branch — merge to main only when exit criteria met

## Cross-Cutting: Autonomy Rules

- Work fully autonomously — no questions to the user
- Fix ALL findings — Critical, High, Medium, AND Low
- Maximum cognitive effort
- Use orchestrated team execution, not plan-approval cycles
- After EVERY sprint: run `/comprehensive-review:full-review`
- ALWAYS run blind spot analysis after completing any task
