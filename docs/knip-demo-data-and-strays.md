# Knip "unused files" — two demo fixtures and six strays, investigated

**Date:** 2026-09-09 · **Branch:** `fix/e2e-elysium` · **HEAD at investigation:** `d5497bdf`

`bun knip` reports eight files as unused. All eight were **re-confirmed independently**: grepping
each module specifier across `src/`, `__tests__/`, `e2e/`, `scripts/` and `prisma/` returns no hit
outside the file itself.

They are eight separate decisions. The history produces **five** distinct stories, not one:

| Story | Files |
|---|---|
| Demo fixture whose consumer became a DB query | `activitiesData.ts` |
| Fixture orphaned by an incomplete cleanup | `barChartData.ts` |
| Superseded component the fork failed to inherit a deletion for | `NumberCard.tsx` |
| Born unreferenced, never wired | `kanban/index.ts`, `useDialogPromise.ts` |
| Commented-out corpse kept as a note-to-self | `utils/company.ts`, `types/index.t.ts` |
| Utility whose job was redistributed, not replaced | `localstorage.utils.ts` |

Two pairs genuinely share a story and should be decided together: `utils/company.ts` +
`types/index.t.ts` (both are 100% comments with zero declarations, both upstream, both
deliberately preserved by their author), and `kanban/index.ts` + `useDialogPromise.ts` (both
rorar's, both born unreferenced inside a commit that shipped working code around them).

---

## Summary table

| File | Origin commit (date, author) | Born unreferenced or orphaned? | What replaced it | Verdict | Confidence |
|---|---|---|---|---|---|
| `src/lib/data/activitiesData.ts` | `11facf1d` 2024-06-18 Khuram Niaz — "Add activities page" | **Orphaned.** 1 importer at birth (`ActivitiesTable.tsx`), last one removed `76148229` 2024-12-11. Dead ~21 months. | Real DB reads via `activity.actions.ts` (`cfee4b3c`, "create and get activities") | **DELETE** | High |
| `src/lib/data/barChartData.ts` | `b28ab207` 2024-05-24 Khuram Niaz — "add dashboard charts" | **Orphaned.** Sole importer `WeeklyBarChart.tsx` deleted `1f718fa9` 2026-02-11. Dead ~7 months. | `WeeklyBarChartToggle.tsx` fed by `getJobsActivityForPeriod()` | **DELETE** | High |
| `src/components/dashboard/NumberCard.tsx` | `1108c566` 2024-05-23 Khuram Niaz — "add dashboard layout and pages" | **Orphaned.** Last importer swapped `2ba7667a` 2026-01-27. Dead ~7.5 months. | `NumberCardToggle.tsx` (same commit) | **DELETE** — *upstream already did, `fe8a329a`* | Very high |
| `src/components/kanban/index.ts` | `6bea840b` 2026-04-02 rorar — "feat(crm): add Kanban Board UI" | **Born unreferenced.** Zero importers in its own commit and every commit since. | Nothing — callers import by path, as the rest of `src/components/` does | **DELETE the barrel only** (all six components are live) | Very high |
| `src/hooks/useDialogPromise.ts` | `55e676ee` 2026-04-08 rorar — "refactor+test: extract BlockConfirmationDialog…" | **Born unreferenced.** The commit message says "extract"; nothing imported it, then or since. | Nothing — `StagingContainer.tsx` still hand-rolls the pattern twice | **DELETE** (or adopt — see below; adoption needs a signature change) | High |
| `src/utils/company.ts` | `5c7daee9` 2024-06-03 Khuram Niaz — "Create company in job form" | **Orphaned then embalmed.** Real export for 1 day; commented out `44a74724` 2024-06-04. Zero declarations for ~27 months. | Server action in `job.actions.ts` (per the file's own comment) | **DELETE** — both landmarks in its comment are now wrong | Very high |
| `src/utils/localstorage.utils.ts` | `b4248158` 2024-07-30 Khuram Niaz — "Add ai settings to select model" | **Orphaned.** Peaked at 3 importers; all removed `c797d559` 2026-01-31. Dead ~7 months. | *No single winner* — 7 live sites inline their own guarded access | **DELETE** | High |
| `types/index.t.ts` | `2e77f478` 2024-05-21 Khuram Niaz — "add dashboard, sidebar" | **Orphaned then embalmed.** Ambient globals used by `Header.tsx`/`Sidebar.tsx` for 9 days; commented out `d21ed97f` 2024-05-30. | Per-component local `interface XProps` throughout `src/` | **DELETE** (removes the `types/` directory) | Very high |

**One caveat on the two upstream fixtures and the two comment files:** `activitiesData.ts`,
`barChartData.ts`, `utils/company.ts` and `types/index.t.ts` all still exist on `upstream/main`
and `upstream/dev`. Deleting them locally adds four paths to the fork's divergence surface.
Per `CLAUDE.md` § Git Workflow the upstream maintainer will not accept PRs, so this is a merge-noise
cost, not a coordination cost — but it is not zero.

---

## Per-file evidence

### 1. `src/lib/data/activitiesData.ts` — demo fixture, replaced by the database

**Origin.** `11facf1db38b08cacdd29be64c26af420948047a` (2024-06-18, Khuram Niaz, *"Add activities
page"*, no body). One-commit feature: it added `src/lib/data/activitiesData.ts` and
`src/components/ActivitiesTable.tsx`, whose line 19 read
`import { activitiesData } from "@/lib/data/activitiesData";` and line 23
`const activities: any = activitiesData;`. So it **was** used — it was the entire data source of
the first Activities page.

**How it died.**

| Commit | Date | Event |
|---|---|---|
| `11facf1d` | 2024-06-18 | Added; sole importer `ActivitiesTable.tsx` |
| `cfee4b3c` | 2024-12-10 | *"create and get activities"* — real persistence arrives. Import removed from `ActivitiesTable.tsx`, briefly re-added to `ActivitiesContainer.tsx` |
| `76148229` | 2024-12-11 | *"delete activity"* — **last importer removed** from `ActivitiesContainer.tsx`. No commit body explains it |
| `f7d0d567` | 2026-03-29 | rorar's ActionResult/domain-model alignment **edits the dead fixture** to add `activityTypeId`, `userId`, `activityName` so it still satisfies `Activity` |

That last row is the interesting one. On 2026-03-29 a large typing refactor mechanically kept a
fixture type-correct that had had no importer for **15 months**. Nothing in the commit message
mentions it; it was swept up because it imports `@/models/activity.model` and the model changed
shape. The file has been paying maintenance rent since December 2024.

**Was a mock-data feature supposed to consume it?** No — and this is worth stating explicitly,
because the hypothesis is plausible. `src/lib/data/` *does* host a live mock-data feature:
`mock.actions.ts` imports `mockActivities.ts` and `mockProfileData.ts`, driven by
`src/components/developer/DeveloperContainer.tsx` behind `isMockDataEnabled()`. But it has never
imported `activitiesData`. Of the nine files in `src/lib/data/`, seven are live
(`jobSourcesData`, `jobStatusesData`, `mockActivities`, `mockProfileData`, `myJobsData` — via the
relative specifier `./data/myJobsData` in `src/lib/mock.utils.ts:10` — `salaryRangeData`,
`testFixtures`). These two are the only strays in a working directory, not the residue of a
dead one.

**False-positive warning for anyone re-checking by grep.** `src/app/dashboard/page.tsx` contains
`activitiesData` at lines 33, 53, 130 and 131 — but it is a **local** binding destructured from
`getActivityDataForPeriod()` in the page's `Promise.all`, not this module. A `grep activitiesData`
makes the fixture look alive. It is not.

**Collateral:** none. Zero mentions in `docs/`, `specs/`, `CLAUDE.md`, `__tests__/`, `e2e/`.

---

### 2. `src/lib/data/barChartData.ts` — a cleanup that deleted the consumer and forgot the data

**Origin.** `b28ab20743fbbb825eb4193abde69c461ceffa4c` (2024-05-24, Khuram Niaz, *"add dashboard
charts"*, no body), created as `src/lib/barChartData.ts` alongside `src/components/WeeklyBarChart.tsx`
— which imported it at line 2. Moved to `src/lib/data/` by `dad31a98` (2024-06-02, *"Refactor salary
range and select field"*), an `R100` rename in a batch that also moved `myJobsData`, `calendarData`
and `seedData.js`.

**How it died.** `1f718fa9b6eb1df09764051bfddaf853f3050c44` (2026-02-11, *"Remove unused
components"*, no body) deleted five components in one go:

```
 src/components/ModeToggle.tsx               |  40 ----
 src/components/RadialChartSekeleton.tsx     |  81 ----
 src/components/TablePagination.tsx          |  74 ----
 src/components/dashboard/RecentJobsCard.tsx |  41 ----
 src/components/dashboard/WeeklyBarChart.tsx | 109 ----
 5 files changed, 345 deletions(-)
```

`WeeklyBarChart.tsx` was `barChartData`'s only importer, ever. The commit removed the consumer and
left the data behind — the identical failure mode that `docs/knip-unused-ui-primitives.md` records
for `ui/pagination.tsx` (same commit, same omission: it deleted `TablePagination.tsx` and forgot
the primitive underneath). **`1f718fa9` is a repeat offender and has now orphaned at least two of
the files in this knip run.**

The live replacement is `src/components/dashboard/WeeklyBarChartToggle.tsx`, fed real weekly counts
from `getJobsActivityForPeriod()`. The fixture's hardcoded `{ day: "Mon", jobs: 14 }` rows were
never localised and could not survive i18n anyway.

**Collateral:** none.

---

### 3. `src/components/dashboard/NumberCard.tsx` — upstream deleted this file; the fork never got the commit

**Origin.** `1108c566cc0c20238d0b4006a96fcccae5a10117` (2024-05-23, Khuram Niaz, *"add dashboard
layout and pages"*) as `src/components/NumberCard.tsx`, imported by `src/app/(dashboard)/page.tsx`.
Moved to `src/components/dashboard/` by `ebf6ae8a` (2024-06-27, `R100`). Last functional change
`ff2d925c` (2024-08-19, *"Calculate trend for jobsApplied"*).

**How it died — twice.**

| Commit | Date | In fork HEAD? | Event |
|---|---|---|---|
| `2ba7667a` | 2026-01-27 | **yes** | *"Combine 7 & 30 day cards on dashboard"* — `dashboard/page.tsx` swaps `import NumberCard` for `import NumberCardToggle`, replacing two `<NumberCard>` instances with one `<NumberCardToggle>`. Orphaned from here. |
| `fe8a329a` | 2026-03-29 | **no** | *"chore: Cleanup unused code"* by Khuram Niaz **deletes `src/components/dashboard/NumberCard.tsx`** (along with `ui/calendar2.tsx`, `ui/pagination.tsx`, `ui/textarea.tsx`). |

`git merge-base --is-ancestor fe8a329a HEAD` → **NO**. The commit exists only on
`upstream/main`, `upstream/dev` and `upstream/copilot/add-3rd-party-app-integration`. The fork's
merge-base with `upstream/main` is `58793625` (2026-03-12), **17 days before the cleanup**. The
file is absent from `upstream/main` today and present here purely because the fork diverged first.

This is the strongest verdict in the set: the original author independently reached the same
conclusion and acted on it. Deleting it here is not a judgement call, it is catching up.

**Collateral — the only non-empty entry in this document.** Two docs still point at it:

- `docs/session-2026-05-12-domain-expert-analysis.md:166` — finding **G7** ("14 hardcoded English
  strings in 7 files") lists `NumberCard.tsx (1)`. The string is real
  (`aria-label={`${trend}% increase`}`, line 36) but the file had already been dead for 3.5 months
  when the review found it. The fix was correctly applied to the *live* `NumberCardToggle` instead
  and is recorded as `M-NEW-01` / `C10` in `docs/BUGS.md:722,1565`. **A review agent spent budget on
  a dead file and produced a finding that could never be worth fixing** — a concrete cost of
  carrying this file.
- `docs/reviews/s5b/data-storytelling.md:188` and `:297` — recommends `NumberCard` as *"the right
  building block for per-channel delivery metrics"* for a **deferred** item (`DS-01`–`DS-05`,
  `docs/BUGS.md:1231`; "data storytelling enhancements" also appears in `CLAUDE.md` § Deferred
  Sprint Work). Deleting the file leaves that recommendation pointing at nothing. **Redirect both
  lines to `NumberCardToggle.tsx` as part of the deletion** — it is the surviving component and the
  one that actually carries the percentage-change indicator the doc describes.

---

### 4. `src/components/kanban/index.ts` — a barrel that was never imported, in the only directory that has one

**Origin.** `6bea840b4c2b8f78ec1901126bd334a995e47940` (2026-04-02, rorar, *"feat(crm): add Kanban
Board UI + S2 deferred frontend fixes"*). The commit added seven kanban files at once — the six
components, plus this barrel.

**The hypothesis in the brief is confirmed: the components are alive, only the barrel is dead.**

| Symbol | Live consumer |
|---|---|
| `KanbanBoard` | `src/components/myjobs/JobsContainer.tsx:52` (by path) |
| `KanbanEmptyState` | `JobsContainer.tsx:53` and `KanbanBoard.tsx:25` (relative) |
| `KanbanViewModeToggle` | `JobsContainer.tsx:54` (by path) |
| `KanbanCard` | `KanbanBoard.tsx:24`, `KanbanColumn.tsx:10` (relative); `__tests__/KanbanCard.spec.tsx:93` |
| `KanbanColumn` | `KanbanBoard.tsx:23` (relative) — **never leaves the directory** |
| `StatusTransitionDialog` | `KanbanBoard.tsx:26` (relative) — **never leaves the directory** |

**Born unreferenced, and provably so.** In its own commit, `JobsContainer.tsx` already imported
`@/components/kanban/KanbanBoard` and `@/components/kanban/KanbanViewModeToggle` by path. Two
pickaxe searches across all refs — `-S 'from "@/components/kanban"'` and `-S 'components/kanban";'`
— return **zero commits**. Nothing has ever imported the barrel specifier, and `index.ts` has never
been modified since creation.

Two of the six re-exports (`KanbanColumn`, `StatusTransitionDialog`) are directory-internal, so
even a future barrel consumer would only want four of them.

**It is also the only such barrel in `src/components/`.** `find src/components -name index.ts`
returns exactly one result: this file. Every other component directory in the repo — `staging/`,
`myjobs/`, `settings/`, `automations/`, `dashboard/`, `crm/` — is consumed by direct path. The
barrels that exist elsewhere (`src/lib/events/`, `src/lib/pii/`, `src/i18n/`, `src/lib/connector/*/`)
are library/module-registration boundaries with a documented purpose. This one is a habit that did
not take.

**Collateral:** `docs/ROADMAP.md:2268` enumerates the 5.6 deliverable as
*"7 React-Komponenten: KanbanBoard, KanbanColumn, KanbanCard, StatusTransitionDialog,
KanbanEmptyState, KanbanViewModeToggle, index barrel"*. It is a description of completed work, not
a plan, but the count becomes wrong (6, and it was only ever 6 components + 1 barrel anyway).
No spec, test or `CLAUDE.md` paragraph names the barrel.

---

### 5. `src/hooks/useDialogPromise.ts` — an extraction that was written but never performed

**Origin.** `55e676eee74c67658a7a1c2035f3b57c2d3586e1` (2026-04-08, rorar,
*"refactor+test: extract BlockConfirmationDialog, memo DeckCard, add 39 tests"*). The body reads:

> Architecture:
> - Extract BlockConfirmationDialog from StagingContainer (SoC)
> - **Extract useDialogPromise hook for Promise-ref pattern**
> - React.memo on DeckCard (prevents re-renders during drag)

**The extraction did not happen.** Of the 13 files in that commit, exactly one contains the string
`useDialogPromise` — the hook itself. `StagingContainer.tsx` was heavily edited in the same commit
(88 lines changed) and *kept* the inline implementation: at `55e676ee` it still had
`blockResolveRef` (line 76), `promotionResolveRef` (line 206), two `new Promise<{success}>` blocks
(259, 275) and two `queueMicrotask` cancel paths (467, 490).

**Five months later it still has them**, in the same shape:

| Concern | `useDialogPromise.ts` | `StagingContainer.tsx` (today) |
|---|---|---|
| ref declaration | `:14` | `:96` (block), `:339` (promotion) |
| unmount cleanup resolving `{success:false}` | `:17-24` | `:344-350` |
| `new Promise` + set ref + open dialog | `:32-36` | `:431-437`, `:447-453` |
| `queueMicrotask` cancel-on-close | `:50-55` | `:834-838`, `:870-874` |

The hook is a correct, well-commented, unit-testable version of code that is duplicated twice in
the file it was extracted from. Adopting it would remove roughly 40 lines.

**But adopting it is no longer a drop-in.** The hook hardcodes `{ success: boolean }`
(`useDialogPromise.ts:14,31,32,40`). `StagingContainer` now resolves
`{ success: boolean; createdJobId?: string }` — the ADR-030 `onAction` contract that threads the
new Job's id to the super-like celebration (`StagingContainer.tsx:851`). The hook has drifted out
of shape with the only call site it was ever meant to serve. Adoption means widening its resolve
type to a second generic; that is a real (small) change, not a mechanical substitution.

**Verdict: delete, or file it as an explicit refactor task — but do not leave it as is.** A hook
that duplicates live logic and is silently incompatible with it is worse than either alternative:
the next person to touch `StagingContainer`'s dialog plumbing will find it, assume it is the
sanctioned abstraction, and discover the type mismatch only after wiring it up.

**Collateral:** none in `docs/`, `specs/`, `CLAUDE.md`, `__tests__/`. `CLAUDE.md`'s "Staging
Details Sheet + Deck Action Routing" and ADR-030 sections describe this exact plumbing without ever
naming the hook — further evidence it was never adopted.
(`__tests__/PromotionDialog.spec.tsx` matches a grep for `resolveRef`, but it tests the dialog
component, not the hook.)

---

### 6. `src/utils/company.ts` — a deliberate teaching comment whose two landmarks no longer exist

**Origin.** `5c7daee97b9b748dcffc5bf5d83a508c483365a6` (2024-06-03, Khuram Niaz, *"Create company in
job form"*) with a real implementation:

```ts
export const upsertCompanyName = async (name: string) => {
  const response = await fetch("/api/company", { method: "POST", ... });
  ...
};
```

imported by `src/components/ComboBox.tsx`.

**How it died — the next day.** `44a747245db462d3dc4c8e93f0af0ac77dc9b743` (2024-06-04, *"Schema
update and refactor to use server actions"*) commented out the entire body and added the header
that is still there:

```
// FOLLOWING IS AN EXAMPLE OF ROUTE HANDLER APPROACH (FOR API refer to api/company/route.ts)
// FUNCTION IS REPLACED BY SERVER ACTION IN job.action.ts
```

So this is **not** an abandoned idea and **not** an orphan in the usual sense — it is an
intentionally preserved worked example, kept as documentation of the route-handler pattern the
project moved away from. It has had zero exported declarations for **27 months**, which is why no
importer is possible and why the pickaxe finds nothing after 2024-06-04.

**Both of its landmarks are now dead.**

- `api/company/route.ts` — `src/app/api/company/` **does not exist**.
- `job.action.ts` — the file is `src/actions/job.actions.ts` (plural). Close enough to follow, but
  wrong as written.

Its content has also drifted from the code it claims to document: the commented version passes
`{ label, value }`, a schema shape the deleted original (`{ name }`) never used and the current
`Company` model does not have. It documents an intermediate state that existed in neither the
before nor the after.

**Verdict: delete.** A comment-only file whose stated references are both wrong is negative
documentation. If the pattern is worth preserving, the place for it is an ADR, not a `.ts` file
that ships in the project graph and shows up in every dead-code scan.

**Collateral:** none.

---

### 7. `src/utils/localstorage.utils.ts` — the job was redistributed, not handed to a successor

**Origin.** `b42481585e4a2c50964297a37340d49be12ff917` (2024-07-30, Khuram Niaz, *"Add ai settings to
select model"*), imported the same day by `src/components/settings/AiSettings.tsx`. By the next
commit (`4b04b996`, 2024-07-31, *"Display selected ai model"*) it had three importers:
`AiSettings.tsx`, `profile/AiJobMatchSection.tsx`, `profile/AiResumeReviewSection.tsx`.

**How it died.** `c797d559` (2026-01-31, *"Use db for settings"*) migrated AI model selection from
the browser to the database in one commit — it added
`prisma/migrations/20260131063928_add_user_settings/`, `src/actions/userSettings.actions.ts` and
`src/models/userSettings.model.ts`, and removed all three imports:

```
-import { getFromLocalStorage } from "@/utils/localstorage.utils";   (AiJobMatchSection)
-import { getFromLocalStorage } from "@/utils/localstorage.utils";   (AiResumeReviewSection)
-  getFromLocalStorage, saveToLocalStorage } from "@/utils/localstorage.utils";  (AiSettings)
```

**"Is something else doing its job?" — no single thing is.** Seven live sites in `src/` touch
`localStorage` directly, and none of them route through the utility:

`staging/DeckView.tsx`, `staging/StagingContainer.tsx`, `staging/StagingLayoutToggle.tsx`,
`staging/ViewModeToggle.tsx`, `ui/toolbar-radio-group.tsx`, `hooks/useKanbanState.ts`,
`hooks/useStagingLayout.ts`.

They share a *convention*, not an abstraction: a module-level `*_STORAGE_KEY` constant plus a
`getPersistedX()` / `persistX()` pair. Compare the two implementations directly —

```ts
// src/utils/localstorage.utils.ts (2024)
export const getFromLocalStorage = (key: string, defaultValue: any) => {
  if (typeof window !== "undefined") {
    const storedValue = localStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : defaultValue;   // any; throws on bad JSON
  }
  return defaultValue;
};

// src/hooks/useStagingLayout.ts (2026)
export function getPersistedStagingLayoutSize(): StagingLayoutSize {
  if (typeof window === "undefined") return DEFAULT_SIZE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_SIZES.includes(stored as StagingLayoutSize)) return stored;
  } catch { /* ignore (privacy mode, quota, etc.) */ }
  return DEFAULT_SIZE;
}
```

The convention that replaced it is **strictly better on three axes** the old util cannot express:
a narrowed return type instead of `any`, a `try/catch` for private-browsing and quota failures, and
membership validation of the stored value. `useKanbanState.ts:81-98` follows the same shape.
Reviving the utility would be a regression, and generalising it to match would mean re-deriving
`useStagingLayout` as a generic — a refactor nobody has asked for.

**Verdict: delete.** This is a "the codebase grew a better habit" story, not a "a duplicate won"
story, and the distinction matters: there is no consolidation opportunity hiding here.

**Collateral:** none.

---

### 8. `types/index.t.ts` — ambient globals from a template, silenced nine days in

**Origin.** `2e77f4781af21a1605cca4e2944dbfb206372a47` (2024-05-21, Khuram Niaz, *"add dashboard,
sidebar"*) with three global ambient declarations:

```ts
declare interface HeaderProps { type?: "title" | "greeting"; title: string; subtext: string; user?: string; }
declare type User = { $id: string; email: string; name: string; };
declare interface SidebarProps { user: User; }
```

They were consumed **ambiently** — no import — by `src/components/Header.tsx` and
`src/components/Sidebar.tsx`, both added in the same commit.

**On the extension.** `.t.ts` is not `.d.ts`. TypeScript treats it as an ordinary source file; the
declarations went global only because the file has no top-level `import`/`export`, which makes it a
*script* rather than a module. It is reached through `tsconfig.json`'s `"include": ["**/*.ts", ...]`
— there is no `types/`-specific entry — and reported by knip through `knip.ts:23`
(`project: ["types/**/*.ts"]`).

**The `$id` field on `User` is an Appwrite convention**, not anything this project has ever used
(JobSync uses NextAuth + Prisma). Combined with `HeaderProps.subtext` and a `SidebarProps` carrying
only a user, this is near-certainly copied from a dashboard starter template and never adapted.

**How it died.** `d21ed97f` (2024-05-30, *"Add job form and minor refactor"*, no body) commented out
all three declarations — nine days after they arrived, in a commit whose subject does not mention
types at all. **No record found** for why: no body, no linked issue, no doc. Given that the file has
been zero-declaration ever since, the most likely reading is that they collided with real prop types
as `Header`/`Sidebar` were rewritten, and commenting was faster than deleting.

**No successor by name — successors by pattern.** A pickaxe on `HeaderProps` and `SidebarProps`
returns later hits, but every one is an unrelated locally-scoped interface matched on substring:
`SettingsSidebarProps` (`settings/SettingsSidebar.tsx:59`), `QuestionsSidebarProps`
(`questions/QuestionsSidebar.tsx:12`), `TasksSidebarProps` (`tasks/TasksSidebar.tsx:12`),
`AutomationDetailHeaderProps` (`automations/AutomationDetailHeader.tsx:28`). The project settled on
per-component local prop interfaces and has no global ambient type file. Nothing named
`HeaderProps`, `SidebarProps` or a global `User` exists today.

**Deletion note:** `types/index.t.ts` is the **only** file under `types/`. Deleting it removes the
directory, and `knip.ts:23`'s `"types/**/*.ts"` project entry then matches nothing. Harmless (knip
tolerates non-matching globs), but the line should go with it.

**Collateral:** none.

---

## Collateral list

Everything outside the eight files that names them. Six of the eight have **none at all** —
in `docs/`, `specs/`, `CLAUDE.md`, `README.md`, `.claude/`, `__tests__/` or `e2e/`.

| Reference | Type | Nature | Action if the file is deleted |
|---|---|---|---|
| `docs/reviews/s5b/data-storytelling.md:188` | Deferred design doc | Recommends `NumberCard` as the model for a delivery-metrics widget (`DS-01`–`DS-05`, deferred) | **Retarget to `NumberCardToggle.tsx`** |
| `docs/reviews/s5b/data-storytelling.md:297` | Deferred design doc | "`NumberCard` … is the right building block for per-channel delivery metrics" | **Retarget to `NumberCardToggle.tsx`** |
| `docs/session-2026-05-12-domain-expert-analysis.md:166` | Closed review record | Finding G7 lists `NumberCard.tsx (1)` as a hardcoded-English site | Leave — historical record; the fix landed on `NumberCardToggle` (`docs/BUGS.md:722`) |
| `docs/ROADMAP.md:2268` | Completed-feature description | Counts "index barrel" as one of the 5.6 kanban deliverables | Drop ", index barrel" from the line |
| `knip.ts:23` (`"types/**/*.ts"`) | Tool config | Only matches `types/index.t.ts` | Remove the glob together with the file |
| `.understand-anything/knowledge-graph.json` + `fingerprints.json` | Generated graph | Nodes for `NumberCard.tsx` (2), `kanban/index.ts` (1), `useDialogPromise.ts` (2), `utils/company.ts` (1), `localstorage.utils.ts` (3), `types/index.t.ts` (1) | Nothing — regenerated. Note the graph is already stale (built at `fca5b10f`, HEAD `d5497bdf`), so it is not evidence either way |

Explicitly checked and **empty** for all eight: `specs/*.allium`, `CLAUDE.md`, `README.md`,
`__tests__/**`, `e2e/**`. The kanban and NumberCard doc hits under `docs/audits/`,
`docs/test-scenario-matrix-s4.md` and `docs/BUGS.md` all name the *live* siblings
(`KanbanCard.tsx`, `KanbanBoard.tsx`, `NumberCardToggle.tsx`), never the flagged files.

---

## Gaps in the record

Per the brief, an absent justification is itself a finding.

- **`76148229`** (removed `activitiesData`'s last importer), **`1f718fa9`** (deleted
  `barChartData`'s only consumer), **`2ba7667a`** (orphaned `NumberCard`), **`c797d559`**
  (orphaned `localstorage.utils`) and **`d21ed97f`** (silenced `types/index.t.ts`) all have
  **empty commit bodies**. Five of the eight deaths are inferred entirely from diffs; no author
  ever wrote down that a file was being left behind.
- **`kanban/index.ts` and `useDialogPromise.ts` were never justified at all**, because nothing ever
  forced the question. Both were created inside commits whose messages describe *other*, genuinely
  delivered work, and neither file has been edited since. `useDialogPromise.ts` is the sharper case:
  its commit message asserts an extraction that the diff does not contain, so the record is not
  merely silent — it is **misleading**. That claim survived code review, five months of sprints,
  and several `/understand` graph refreshes.
