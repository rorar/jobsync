# E2E Gap Analysis & Repair Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify and fix all 19 remaining E2E test failures by systematically analyzing gaps between test expectations and current app code.

**Architecture:** Three-phase approach: (1) Comprehensive review identifies gaps between E2E tests and app code, (2) E2E testing patterns skill classifies each gap, (3) Fixes applied per test file with verification runs between each.

**Tech Stack:** Playwright, Next.js 15 App Router, Prisma/SQLite, Shadcn UI

**Context:** The other security-fix agent changed 47 files including `job.actions.ts`, `profile.actions.ts`, `auth.actions.ts`, `middleware.ts`, API routes, and auth forms. Some of these changes may have broken E2E test selectors, toast messages, or navigation flows.

---

## Phase 1: Gap Analysis (Comprehensive Review)

### Task 1: Analyze Automation CRUD gaps (5 failures)

**Files:**
- Test: `e2e/crud/automation-crud.spec.ts`
- App: `src/components/automations/AutomationWizard.tsx` (or equivalent wizard component)
- App: `src/actions/automation.actions.ts`
- App: `src/components/automations/AutomationContainer.tsx`

- [ ] **Step 1: Read the test file — extract what each failing test expects**
  - `createAutomation()` helper: what toast/redirect/dialog-close does it wait for?
  - `deleteAutomation()` helper: what confirmation pattern?
  - Edit, pause/resume: what status indicators?

- [ ] **Step 2: Read the app components — extract what actually happens**
  - What toast message fires on automation create? (check `toast({ ... })` calls)
  - Does `revalidatePath` cause a page refresh that dismisses the toast?
  - What happens after the wizard completes — redirect or dialog close?

- [ ] **Step 3: Document each gap**
  - Gap template: `TEST EXPECTS: X | APP DOES: Y | FIX: change test/app`

### Task 2: Analyze Job CRUD gaps (3 failures)

**Files:**
- Test: `e2e/crud/job-crud.spec.ts`
- App: `src/components/myjobs/AddJob.tsx`
- App: `src/actions/job.actions.ts` (recently modified by security agent)
- App: `src/components/myjobs/JobsContainer.tsx`

- [ ] **Step 1: Check if the security agent's changes to `job.actions.ts` broke the AddJob flow**
  - `updateJob` now checks `userId: user.id` in where — does the E2E test pass the right userId?
  - `getJobDetails` now uses `findFirst` with userId — any behavior change?

- [ ] **Step 2: Check the `ensureResumeExists` helper added by our fix agents**
  - Does it navigate to the right page?
  - Does the resume actually get created?
  - What status value does the test use for new jobs? Does "draft" exist in JobStatus table?

- [ ] **Step 3: Run `sqlite3 prisma/dev.db "SELECT * FROM JobStatus;"` to verify seeded statuses**

### Task 3: Analyze Profile CRUD gaps (3 failures)

**Files:**
- Test: `e2e/crud/profile-crud.spec.ts`
- App: `src/components/profile/ProfileContainer.tsx`
- App: `src/actions/profile.actions.ts` (recently modified — IDOR ownership checks added)

- [ ] **Step 1: Check if new ownership checks in `profile.actions.ts` affect E2E**
  - `addContactInfo`, `addResumeSummary`, `addExperience` now have ownership verification
  - Does the E2E test use a resume that belongs to the logged-in user?

- [ ] **Step 2: Check dialog selectors for contact info and summary**
  - What menu item opens the dialog? Has it been renamed?
  - What heading does the dialog have? Is the `.first()` fix sufficient?

### Task 4: Analyze Keyboard UX gaps (4 failures)

**Files:**
- Test: `e2e/crud/keyboard-ux.spec.ts`
- App: `src/components/automations/widgets/EuresOccupationCombobox.tsx`
- App: `src/components/ui/chip-list.tsx`

- [ ] **Step 1: Identify which failures are ESCO API-dependent vs selector issues**
  - Lines 459, 509: ESCO occupation — requires live API?
  - Lines 340, 417: TagInput — flaky under parallel execution?

- [ ] **Step 2: Check if ESCO API proxy routes were modified by security agent**
  - `src/app/api/esco/search/route.ts` and `details/route.ts` were in the changed files list

### Task 5: Analyze remaining gaps (Company, Question, Wizard Modules)

**Files:**
- Test: `e2e/crud/company-crud.spec.ts` (1 failure: edit)
- Test: `e2e/crud/question-crud.spec.ts` (1 failure: edit)
- Test: `e2e/crud/automation-wizard-modules.spec.ts` (2 failures)
- App: `src/components/settings/ApiKeySettings.tsx`
- App: `src/actions/module.actions.ts`

- [ ] **Step 1: Company edit — flaky or deterministic?**
  - Run isolated 3x to check

- [ ] **Step 2: Question edit — check `getQuestionById` server action**
  - Was it modified by the security agent?

- [ ] **Step 3: Wizard modules — check if JSearch module toggle works**
  - The test was changed to use JSearch instead of EURES
  - Does JSearch have credential type API_KEY and appear on settings page?

---

## Phase 2: Fix Implementation

### Task 6: Fix Automation CRUD (5 tests)

Based on Task 1 findings, implement fixes.

- [ ] **Step 1: Apply fixes to `e2e/crud/automation-crud.spec.ts`**
- [ ] **Step 2: Run isolated: `npx playwright test e2e/crud/automation-crud.spec.ts --workers=1`**
- [ ] **Step 3: Verify 5/5 pass**
- [ ] **Step 4: Commit**

### Task 7: Fix Job CRUD (3 tests)

Based on Task 2 findings.

- [ ] **Step 1: Apply fixes to `e2e/crud/job-crud.spec.ts`**
- [ ] **Step 2: Run isolated**
- [ ] **Step 3: Verify 3/3 pass**
- [ ] **Step 4: Commit**

### Task 8: Fix Profile CRUD (3 tests)

Based on Task 3 findings.

- [ ] **Step 1: Apply fixes**
- [ ] **Step 2: Run isolated**
- [ ] **Step 3: Verify 3/3 pass**
- [ ] **Step 4: Commit**

### Task 9: Fix Keyboard UX + remaining (4 + 3 tests)

Based on Tasks 4-5 findings.

- [ ] **Step 1: Apply fixes**
- [ ] **Step 2: Run isolated**
- [ ] **Step 3: Verify pass**
- [ ] **Step 4: Commit**

---

## Phase 3: Verification

### Task 10: Full E2E regression run

- [ ] **Step 1: Kill dev server, let Playwright start fresh**
- [ ] **Step 2: Run full suite: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium npx playwright test --workers=4`**
- [ ] **Step 3: Report pass/fail count — target: 68/68 or document accepted failures (ESCO API dependency)**
- [ ] **Step 4: Update ROADMAP 8.5 with final results**
- [ ] **Step 5: Final commit**

---

## Agent Orchestration

| Phase | Agent/Skill | Input | Output |
|-------|-------------|-------|--------|
| 1 | `/comprehensive-review:full-review` | 7 E2E test files + corresponding app code | Gap report per test file |
| 1 | `/e2e-testing-patterns` | Gap report | Classified fixes (selector, timing, API mock) |
| 2 | `/full-stack-orchestration:full-stack-feature` | Classified fixes | Fixed test files with verification |
| 3 | Verification run | Full E2E suite | Pass/fail report |
