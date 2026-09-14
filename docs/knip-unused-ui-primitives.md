# Knip "unused files" — the four UI primitives, investigated

**Date:** 2026-09-09 · **Branch:** `fix/e2e-elysium` · **HEAD at investigation:** `d5497bdf`

`bun knip` reports four files under `src/components/ui/` as unused, plus the dependency
`@radix-ui/react-avatar`. All four were re-confirmed to have **zero importers** by grepping the
module specifier across `src/`, `__tests__/` and `e2e/` — no match outside each file itself.

These are **four separate decisions**. Three are cheap, reversible deletions of code that history
shows was superseded. The fourth is not dead code at all in the usual sense, and its finding is
about something worse than an unused file.

---

## Summary table

| File | Origin commit (date) | Ever used? | What references it today | Verdict |
|---|---|---|---|---|
| `src/components/ui/avatar.tsx` | `1108c566` (2024-05-23) — vendored shadcn primitive inside "add dashboard layout and pages" | **Yes.** `RecentJobsCard` 2024-05-23 → `RecentCardToggle` 2026-02-11. Last importer removed `2b931ab1` (2026-04-06), replaced by `CompanyLogo`. | Nothing. Zero code, zero docs, zero specs, zero tests. | **DELETE** (with `@radix-ui/react-avatar`). High confidence. |
| `src/components/ui/pagination.tsx` | `03286cdf` (2024-06-06) — "Add pagination", vendored *with* its only consumer | **Yes.** Only ever via `src/components/TablePagination.tsx`. Consumers dropped 2024-12-25 (`15755c21`, `52896f17`); `TablePagination.tsx` deleted 2026-02-11 (`1f718fa9`), which forgot the primitive underneath. | Nothing. | **DELETE.** High confidence. |
| `src/components/ui/calendar2.tsx` | `614799e9` (2024-06-28) — "Add/Edit work experience" | **Never.** No commit on any branch ever contained an import of it (`git log --all -S 'calendar2' -- src/` → empty). | `docs/BUGS.md:582` (one deferred-design row). | **DELETE**, edit `BUGS.md:582`. High confidence. |
| `src/components/ui/base-combobox.tsx` | `89266b3d` (2026-03-25) — "refactor(combobox): extract onCreateOption prop… Create BaseCombobox headless wrapper (D15)" | **Never — not even by the commit that created it and said it had.** | 2 Allium specs, 5 docs, 1 ADR, CHANGELOG, and an E2E `describe` block named after it. | **KEEP the file, fix the record.** It is a live, tracked refactor target (ADR-038, debt §G). See §4 — the finding here is not "delete this". Medium-high confidence. |

---

## 1. `src/components/ui/avatar.tsx` — superseded by `CompanyLogo`

**Origin.** `1108c566cc0c20238d0b4006a96fcccae5a10117`, 2024-05-23, Khuram Niaz, *"add dashboard
layout and pages"*. A 16-file commit that also vendored `ui/card.tsx` and `ui/progress.tsx` and
added `@radix-ui/react-avatar` to `package.json`. This is a **shadcn batch import** —
`components.json` at the repo root confirms the shadcn CLI is configured — but it was not
speculative: the same commit added `src/components/RecentJobsCard.tsx` with
`import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";`.

**Life and death.**

| Commit | Date | Event |
|---|---|---|
| `1108c566` | 2024-05-23 | Added; imported by `RecentJobsCard.tsx` |
| `6ba2380b` | 2026-02-11 | `dashboard/RecentCardToggle.tsx` picks up the import ("add recent activites card") |
| `1f718fa9` | 2026-02-11 | `dashboard/RecentJobsCard.tsx` deleted ("Remove unused components") — one importer left |
| `2b931ab1` | 2026-04-06 | **Last importer removed.** *"fix(ui): improve company logo rendering and SVG support — RecentCardToggle: replace Avatar with CompanyLogo (consistent rendering)"* |

This is unambiguously a **"replaced by X"** case, not a "feature was cut" case. The replacement is
`src/components/ui/company-logo.tsx`, which does the same job better (skeleton → image → initials
fallback, per CLAUDE.md § Data Enrichment). `avatar.tsx` has been dead for **5 months**.

Note there is a second, unrelated avatar in the tree: `src/components/UserAvatar.tsx` renders
`next/image` against `/images/placeholder-user.jpg` directly (`UserAvatar.tsx:9-15`). It has never
used `ui/avatar.tsx`. So nothing in the app renders a Radix avatar.

**Deletion cost.** `src/components/ui/avatar.tsx` (50 lines) and the `package.json:38` dependency
line. **No** doc, spec, test or E2E reference exists. Reversible in one command
(`bunx shadcn@latest add avatar`).

**Recommendation: DELETE both. Confidence: high.**

---

## 2. `@radix-ui/react-avatar` — confirmed single-consumer

- Declared as a direct dependency at `package.json:38` (`"@radix-ui/react-avatar": "^1.1.2"`).
- The only import in the repo is `src/components/ui/avatar.tsx:4`.
- No other installed package depends on it: of all `node_modules/**/package.json`, only
  `node_modules/@radix-ui/react-avatar/package.json` itself names it. It is not a transitive peer
  of any other `@radix-ui/*` package we use.

So removing `avatar.tsx` makes the dependency genuinely unreachable, and removing the dependency
would break `avatar.tsx` if it stayed. **The two must be deleted together or not at all.**

**Confidence: high.**

---

## 3. `src/components/ui/pagination.tsx` — an orphan left by a cleanup that missed one level

**Origin.** `03286cdf42ed42950a64d37ecea6abd8aa2850f4`, 2024-06-06, Khuram Niaz, *"Add
pagination"*. Vendored **together with its consumer** in the same commit:
`src/components/TablePagination.tsx` (74 lines) plus `MyJobsTable.tsx` wiring. Not a speculative
batch import — it was written for a feature that shipped.

**Life and death.** The chain is two levels deep, which is exactly why it survived:

| Commit | Date | Event |
|---|---|---|
| `03286cdf` | 2024-06-06 | `ui/pagination.tsx` + `TablePagination.tsx` added together |
| `78b4f0cd`, `4d48d441`, `8c39ad37` | 2024-06 | `TablePagination` adopted by company/title/location tables |
| `15755c21` | 2024-12-25 | *"Refactor companies, titles and locations pagination"* — removes `TablePagination` from 3 admin tables |
| `52896f17` | 2024-12-25 | *"Refactor resume table and job table pagination"* — removes the last two (`MyJobsTable`, `ResumeTable`) |
| `1f718fa9` | 2026-02-11 | *"Remove unused components"* deletes `TablePagination.tsx` — **but not `ui/pagination.tsx`** |

`git show 1f718fa9^:src/components/TablePagination.tsx` confirms it imported all seven exports from
`@/components/ui/pagination`. It was the **only** consumer, ever.

**Architecturally obsolete, not merely unimported.** The 2024-12-25 refactor replaced numbered page
links with an append/"load more" model: `JobsContainer.tsx:191`
(`setJobs(prev => page === 1 ? data : [...prev, ...data])`) plus `jobs.loadMore`
(`JobsContainer.tsx:497`) and the shared `RecordsPerPageSelector.tsx`. There is no numbered-page UI
anywhere in the app — `grep -rln "ChevronLeft" src/components/` matches only `calendar.tsx`,
`calendar2.tsx`, `pagination.tsx` and `WizardShell.tsx`. So `ui/pagination.tsx` implements an
interaction model the product deliberately left behind, and would not be reused as-is.

**Deletion cost.** `src/components/ui/pagination.tsx` (117 lines). Nothing else — no doc, spec, test
or E2E reference. Re-addable via `bunx shadcn@latest add pagination`.

**Recommendation: DELETE. Confidence: high.**

---

## 4. `src/components/ui/calendar2.tsx` — a variant that was downloaded and then not used, in the same commit

**Origin.** `614799e94eb6d7a45092511d92b48fd3cfe8c698`, 2024-06-28, Khuram Niaz, *"Add/Edit work
experience"*.

**What it is.** A **drop-in alternative** to `calendar.tsx`, not an extension. Both export the
identical symbols — `calendar.tsx:216` and `calendar2.tsx:255` are both
`export { Calendar, CalendarDayButton };`. `diff -u` between them is 97 lines and reduces to:

| Difference | Where |
|---|---|
| Adds a `Dropdown` component override: shadcn `Select` + `ScrollArea` for month/year pickers (~33 lines) | `calendar2.tsx:161-194` |
| `captionLayout` defaults to `"dropdown"` instead of `"label"` | `calendar2.tsx:30` vs `calendar.tsx:20` |
| Imports `ScrollArea` and `Select*` | `calendar2.tsx:13-20` |
| **Drops** the two RTL `rotate-180` chevron rules that `calendar.tsx` has | `calendar.tsx:33-34` absent in `calendar2.tsx` |
| Slightly different `day` rounding when `showWeekNumber` is set | `calendar2.tsx:103-107` |

The original 110-line version (`git show 614799e9:src/components/ui/calendar2.tsx`) was the same
idea against the react-day-picker v8 API (`DropdownProps`, `IconLeft`/`IconRight`) — i.e. the
well-known react-day-picker "dropdown caption" recipe. It is **not** a standard shadcn registry
component under that filename; no record was found of where the snippet was copied from.

**Was it ever used? No — never, on any branch.** `git log --all -S 'calendar2'` returns only
`/understand` knowledge-graph refresh commits and one `docs(bugs)` commit. `git log --all -S
'Calendar2'` returns nothing at all (the component inside is named `Calendar`, colliding with
`calendar.tsx`'s export — a second reason it could never be imported alongside it without
aliasing).

**Why it was never used is visible in its own introducing commit.** `614799e9` needed a
year/month dropdown for the work-experience date fields. It solved that a *different* way, against
the existing file: it added a `captionLayout` prop to `DatePicker.tsx` that sets
`captionLayout="dropdown-buttons"` / `fromYear` / `toYear` on `@/components/ui/calendar`
(`git show 614799e9 -- src/components/DatePicker.tsx`), and in the same commit patched
`calendar.tsx` with `caption_dropdowns: "flex justify-center gap-1"`. `calendar2.tsx` is the
approach that was tried and abandoned within one commit, and then committed anyway.

**It has been maintained twice for nothing.** Both files carry the same history:

- `8d0a6879` (2025-12-07, *"Fix docker build and datepicker errors"*) — react-day-picker v9 migration, applied to both.
- `bafb815a` (2026-04-10, *"a11y(ui): Sprint 4 Stream F — size=\"icon\" → size=\"icon-lg\" sweep"*) — applied to both.

Two migration passes and one a11y sweep were spent on a file that has never rendered a pixel.

**Live consumers of `calendar.tsx`** (the one that is real): `src/components/DatePicker.tsx:9` and
`src/components/crm/InterviewForm.tsx:26`.

**Deletion cost.**

1. `src/components/ui/calendar2.tsx` (255 lines).
2. `docs/BUGS.md:582` — the deferred-design row reads
   ``| `ui/calendar.tsx`, `ui/calendar2.tsx` | **Kept at `size="icon"`** — react-day-picker header
   uses `--cell-size: 2rem` hard constraint… |``. Drop the second file name; the row itself stays,
   because the constraint is real for `calendar.tsx`. (CLAUDE.md's "Design-gated items" bullet for
   the same item does not name `calendar2`, so CLAUDE.md needs no edit.)

**One caveat, stated so it can be dismissed deliberately:** if the deferred
`--cell-size 2rem → 44px` design decision (CLAUDE.md § Design-gated items) is ever taken, a
dropdown-caption calendar may be wanted. But `calendar.tsx` already supports
`captionLayout="dropdown"` natively in react-day-picker v9 — `calendar2`'s only remaining unique
content is a **custom `Dropdown` render override**, ~33 lines, reconstructible from the
react-day-picker docs. It is not worth carrying through further migrations.

**Recommendation: DELETE, plus the one-word edit to `docs/BUGS.md:582`. Confidence: high.**

---

## 5. `src/components/ui/base-combobox.tsx` — the one that needs care

### 5.1 It has never had an importer. Not once. Including at birth.

`git log --all -S 'BaseCombobox' -- src/` returns **exactly one commit**: `89266b3d`, the one that
created the file. `git log --all -S 'base-combobox' -- src/` returns **nothing**. No file in
`src/`, on any of the 20 local branches, has ever contained the string
`@/components/ui/base-combobox`.

That is not merely "the last consumer went away". The introducing commit,
`89266b3d459ea5116c9a9dac496e4917a2c28ff5` (2026-03-25), says:

> ```
> refactor(combobox): extract onCreateOption prop, remove domain switch (D15)
>
> - ComboBox.tsx: remove 5 domain server action imports + switch(field.name)
> - Add onCreateOption callback prop — callers own their domain logic
> - Create BaseCombobox headless wrapper (src/components/ui/base-combobox.tsx)
> - Update all 5 callers: AddJob, ActivityForm, TaskForm, AddEducation, AddExperience
> ```

Three of those four bullets happened. `git show 89266b3d -- src/components/ComboBox.tsx` shows
`ComboBox.tsx` keeping its own inline `<Popover>` / `<PopoverTrigger>` / `<CommandInput>` /
`<CommandEmpty>` tree throughout the diff. The wrapper was written and committed; nothing was
wired to it.

And the file says so about itself, incorrectly, at `base-combobox.tsx:30-31`:

> ```
>  * NOTE: Currently only consumed by the generic Combobox. Other variants
>  * can migrate incrementally per C4 Recommendation 2.
> ```

**That sentence was false on the day it was written**, and it is the root of everything in §5.3.

### 5.2 What the specs specify, and which file implements it today

**`specs/base-combobox.allium`** (369 lines) is titled *"BaseCombobox: Shared headless combobox
wrapper behaviour"* and specifies far more than a shell: keyboard rules (`KeyboardTab`,
`KeyboardOpenDropdown`, `KeyboardTabOut`), a **selection model** (`SingleSelectDefault`,
`ValueBindingDisplay`), **creation behaviour** (`CreateAsyncStart`, …, driven by
`state.is_creating` and a `create_visible` derivation), an async-loading slot
(`AsyncOptionsLoading`), and invariants (`AtMostOneSelected`, `EmptyStringNeverSelected`).

**`src/components/ui/base-combobox.tsx` implements almost none of that.** Its entire props surface
(`base-combobox.tsx:34-61`) is presentational — `triggerLabel`, `open`, `inputValue`, `filter`,
`children`. There is no selection state, no `onCreateOption`, no `isCreating`, and no
`isLoadingOptions` at all — so the `AsyncOptionsLoading` rule (`specs/base-combobox.allium:236-253`,
which requires a Loader in the list area and suppression of `CommandEmpty`) is implemented **by no
file in the repository**.

**The file that actually implements the spec is `src/components/ComboBox.tsx`** (230 lines). It
owns every obligation the spec names:

| Spec obligation | `ComboBox.tsx` |
|---|---|
| Popover shell | `:123-228` |
| Trigger with `role="combobox"`, `type="button"`, `aria-expanded` | `:134-136` |
| `CommandInput` / `CommandList` / `CommandEmpty` | `:157`, `:194`, `:167-191` |
| Creation dispatch + spinner (`is_creating`) | `:148` (`<Loader … spinner />`), `onCreateOption` prop at `:30-32` |
| Single-select + close-on-select | `:202` |

The remaining multi-select variants the specs name — `TagInput` (`src/components/myjobs/`),
`EuresLocationCombobox`, `EuresOccupationCombobox`, `EuresLanguageCombobox`
(`src/components/automations/`) — each hand-roll the same shell independently. That is precisely
the duplication `docs/architecture/c4-component-combobox.md:204-208` (Recommendation 2) proposed to
remove, and which has not been done.

`specs/ui-combobox-keyboard.allium` compounds the confusion: at `:343-345` its
`@guarantee ConsistentAcrossVariants` enumerates *"All five combobox variants (BaseCombobox,
EuresLocationCombobox, EuresOccupationCombobox, EuresLanguageCombobox, TagInput)"* — using
`BaseCombobox` as the name of the generic single-select variant. The generic single-select variant
is `ComboBox.tsx`. Same at `:286` and `:310-312`.

**So: the spec is not orphaned. It is mis-addressed.** Its obligations are met (all but one) by
`ComboBox.tsx`, under a different name.

### 5.3 The consequences of the mis-addressing, which are the real finding

Because two specs, an E2E `describe` block and a C4 document all use the name `BaseCombobox` for
behaviour that lives in `ComboBox.tsx`, verification work has repeatedly landed on the wrong file:

1. **A weed finding was raised against, and "fixed" in, the file nothing renders.**
   The WEED-1 row in `docs/BUGS.md` records *"WEED-1 | MEDIUM | BaseCombobox missing `aria-expanded`
   and `type="button"` on trigger | Added both attributes (`base-combobox.tsx`)"*. The fix is
   `32a33707` (2026-04-01), which touched `src/components/ui/base-combobox.tsx` **and nothing else
   in that area**. But the *live* trigger had already received both attributes **six days** earlier in
   `f8180a8e` (2026-03-26) — `git show f8180a8e -- src/components/ComboBox.tsx` shows
   `+ type="button"` and `+ aria-expanded={isPopoverOpen}`. The weed pass compared the spec to the
   file the spec *names*, found the gap there, and patched a component no user reaches.

   *(Corrected 2026-09-14: this paragraph said "five days". The elapsed time between the two commits
   is 6 d 7 h 1 m, computed from author epochs. Naive date arithmetic in this timezone returns five,
   because the 2026-03-29 DST transition falls inside the interval and rounds 5 d 23 h down. The
   docs commit that recorded WEED-1, `86ed7f86`, landed 31 minutes after `32a33707` — so the row was
   written from the landed diff, not ahead of it. The bookkeeping was faithful; the target was not.)*

2. **The CHANGELOG announces a user-facing a11y fix that changed nothing users see.**
   `CHANGELOG.md:491`: *"**a11y:** BaseCombobox trigger now has `aria-expanded` and
   `type="button"` (WEED-1)"*.

3. **The E2E suite names a component it does not exercise.** `e2e/crud/keyboard-ux.spec.ts:330`
   (*"Tests: 1. BaseCombobox (AddJob modal — Title, Company, Location, Source)"*) and `:333`
   (`test.describe("Keyboard UX: BaseCombobox (AddJob modal)", …)`). The tests are correct and
   valuable — they drive the AddJob dialog's real comboboxes — and the test body even knows the
   truth: a comment at `:356` reads *"ComboBox announces t(\"forms.optionCreated\")"*. Only the
   `describe` name is wrong. **Renamed 2026-09-14** to `Keyboard UX: Combobox (AddJob modal)`, with
   the reason recorded in the comment block above it. The rename is safe because nothing selects on
   that title — it appears only in this document and in the spec file itself.

4. **A spec was extended for the dead file.** `fed10760` (2026-06-20,
   *"spec(combobox): add async-loading slot + trigger accessible-name guarantees"*) added
   `is_loading_options` + the `AsyncOptionsLoading` rule to `specs/base-combobox.allium` and
   `@guarantee TriggerHasAccessibleName` to `specs/ui-combobox-keyboard.allium`. Both are
   reasonable contracts; both are currently satisfied by no file, and the spec attributes the
   loading indicator to a component that has no loading prop.

This is a live illustration of the caveat already recorded in CLAUDE.md: *"`allium check` proves
syntax, NOT reference integrity."* `allium check` was reported green for `fed10760`. The spec
parses. It also names a file that has never been in a render tree.

### 5.4 The file is a tracked, deliberately-deferred refactor target — do not delete it silently

Three current planning documents treat `ui/base-combobox.tsx` as **future work that has been
scoped and postponed on purpose**, with a stated reason:

- `docs/inside-track-implementation-debt.md:185-190` — *"**Combobox consolidation onto
  `ui/base-combobox.tsx`** (C4 ComboBox analysis, Recommendation 2). The Inside Track pickers + the
  ~9 other specialised comboboxes still hand-roll the Popover+Command shell. `BaseCombobox`
  currently lacks a trigger `aria-label`, an `aria-live` announce, a loading slot, and overridable
  width/`capitalize` — so migrating piecemeal would **regress a11y**. Do as ONE cross-cutting pass…"*
- `docs/adr/038-inside-track-referral-architecture.md:73-76` — the same item under
  "Deferred / follow-ups (tracked)", tagged §G.
- `docs/BACKLOG.md:241` — the `CompanyAssociation.companyLabel` staleness entry names *"the
  BaseCombobox consolidation (§G) introducing server-side company search"* as one of its two
  triggers for revisiting.

Note that the debt entry's own list of what `BaseCombobox` lacks is accurate against
`base-combobox.tsx:34-61`. The deferral is well-reasoned and the file is its intended starting
point. Deleting it would delete the target of a decision that was made deliberately, and would
strand §G, ADR-038 and `BACKLOG.md:241`.

**Deletion cost, if it were deleted anyway** (listed for completeness — 11 sites):
`src/components/ui/base-combobox.tsx` (114 lines) · `specs/base-combobox.allium` (369 lines,
entire file) · `specs/ui-combobox-keyboard.allium:286,310-312,343` · `docs/architecture/overview.md:240`
(spec index row) · `docs/architecture/c4-component-combobox.md:129,148,204-208,368-372` ·
`docs/adr/038-…:73-76` · `docs/inside-track-implementation-debt.md:185-190` ·
`docs/BACKLOG.md:241` · `docs/BUGS.md` (the WEED-1 row) · `CHANGELOG.md:491` ·
`e2e/crud/keyboard-ux.spec.ts:330,333`. Two of these (the ADR and the CHANGELOG) are historical
records that should be corrected in place, not erased.

### 5.5 Recommendation

**KEEP the file. Fix the record instead.** Confidence: medium-high — high on the facts (the
zero-importer history and the mis-addressing are both provable), medium on the disposition, because
"keep an unused file because a deferred plan names it" is only correct while the plan is real. Two
concrete options:

**Option A (recommended, cheap, ~30 min, no behaviour change).** Keep `base-combobox.tsx`, and make
the record honest so no future weed/review pass burns budget on it again:

1. Fix `base-combobox.tsx:30-31` — replace *"Currently only consumed by the generic Combobox"* with
   the truth: *"Not yet consumed by any component. Adoption is tracked as §G / ADR-038; see
   `docs/inside-track-implementation-debt.md:185`."* — **DONE 2026-09-14.** The replacement also
   records that the claim was false in the creating commit, and why adoption has to be one pass.
2. Add a header note to `specs/base-combobox.allium` recording that the selection/creation/keyboard
   rules are today implemented by `src/components/ComboBox.tsx`, and that `base-combobox.tsx`
   implements only the shell rules (`BaseComboboxOwns`) — so a weed pass knows which file to judge.
   Per CLAUDE.md, spec edits go through `allium:tend`, not by hand. — **OPEN.** Deliberately not
   done by hand; it needs the `allium:tend` agent, which is a separate dispatch.
3. Rename the E2E `describe` at `e2e/crud/keyboard-ux.spec.ts:333` to `ComboBox (AddJob modal)`.
   — **DONE 2026-09-14**, as `Keyboard UX: Combobox (AddJob modal)`, keeping the file's existing
   `Keyboard UX:` prefix.
4. Add `src/components/ui/base-combobox.tsx` to `knip.ts`'s `ignore` array with a one-line comment
   pointing at §G, so knip stops re-reporting it every run. — **OPEN, and gated on the Option A/B
   choice below.** Suppressing the report is only right if the file is being kept; under Option B
   the report is the reminder to finish the deletion. Note also that "knip reports it every run"
   is inherited from this document and has not been re-measured since.
5. Correct `docs/BUGS.md:1443` / `CHANGELOG.md:491` to note that the WEED-1 attributes were already
   present on the live trigger since `f8180a8e`, so the entry is not read as a shipped a11y fix.
   — **DONE 2026-09-14.** Both records corrected in place rather than deleted. The corrections say
   "changed no rendered markup" rather than "reached zero users": the provable fact is that a file
   with no importer emits no markup, and everything about users follows from that rather than being
   measured.

**Re-verified 2026-09-14** by two independent read-only passes before any of the above was written:
zero importers (grep at HEAD, no `src/components/ui/index.ts` barrel, and `git log --all -S` over
`src/` returning only the creating commit); `ComboBox.tsx:135-136` carrying both attributes
continuously since `f8180a8e`; and — the question the original weed pass should have asked — **all
fourteen live combobox triggers render both attributes today**, so nothing here is a present-day
a11y gap. Exactly one test asserts `aria-expanded` anywhere
(`__tests__/EuresLanguageCombobox.spec.tsx:366-369`), and it mounts a third component; neither
attribute is pinned on `ComboBox.tsx` or on this file, in literal or non-literal form
(`toBeExpanded`, `{ expanded: … }` — zero hits in `e2e/` and `__tests__/`).

**Three separate facts there, which must not collapse into "no gap":**

- *Rendered output* — no defect. All fourteen triggers emit both attributes.
- *Source consistency* — eleven declare `type="button"` in JSX; **three do not**:
  `src/components/automations/WizardShell.tsx:269`, `src/components/crm/InterviewForm.tsx:270` and
  `:450`. All three sit inside a real `<form onSubmit=…>`, and `src/components/ui/button.tsx:53-63`
  sets no default `type`, so on JSX alone they read like submit-on-click defects. They are not:
  Radix's `PopoverTrigger` sets `type: "button"` and `aria-expanded` **before** spreading the child's
  props (`@radix-ui/react-popover` 1.1.15, `dist/index.mjs:89,91,94`), and `react-slot`'s `mergeProps`
  returns `{...slotProps, ...overrideProps}` where a key the child omits keeps the slot's value.
- *Spec* — read literally against JSX, those three diverge from `TriggerAriaExpanded`
  (`specs/ui-combobox-keyboard.allium:362-366`), which says the trigger MUST *include* `type="button"`.
  A spec-vs-source divergence with no user-visible consequence. Worth a future `allium:weed` pass
  deciding whether the guarantee means "declares" or "renders" — it currently reads as the former
  while the codebase satisfies the latter.

The inherited-from-Radix arrangement is **version-coupled, not an invariant of the code under
review**. If Radix ever stopped injecting `type`, those three regress silently into real
submit-on-click bugs, and nothing in `__tests__/` or `e2e/` would catch it — which is the same
absence of a pin that let WEED-1 be "fixed" in the wrong file without anything noticing.

A corollary for the finding itself: since Radix supplies both attributes to every Popover-based
trigger, the `type="button"` that `32a33707` added was a no-op at runtime *even on the counterfactual
where this file had been imported*.

**Option B (only with an explicit decision).** If §G is not going to happen, close it properly:
delete the file, delete `specs/base-combobox.allium`, fold its still-true keyboard/selection rules
into `specs/ui-combobox-keyboard.allium` **renamed onto `ComboBox.tsx`**, and mark the §G/ADR-038
entries superseded. This is the honest alternative, but it is a product decision, not a cleanup.

**Do not do the third thing** — delete the file and leave the specs and §G in place. That would
leave two Allium specs and an ADR promising a seam that no longer exists, which is the same failure
mode CLAUDE.md already warns about for `data-enrichment/registry.ts`.

---

## Appendix — how each claim was checked

- **Zero importers:** `grep -rn "<specifier>" src/ __tests__/ e2e/` for each of `ui/avatar`,
  `ui/base-combobox`, `ui/calendar2`, `ui/pagination` — no match outside the file itself.
- **Origin:** `git log --diff-filter=A --follow -- <path>`, then `git show --stat` on the sha.
- **Ever used:** `git log --all -S '<Identifier>'` and `git log --all -S '<path-fragment>'`, both
  repo-wide and restricted to `-- src/`, across all 20 local branches.
- **Dependency reachability:** `grep -rl '"@radix-ui/react-avatar"' node_modules/*/package.json
  node_modules/@*/*/package.json` → only the package's own manifest.
- **Diff between calendars:** `diff -u src/components/ui/calendar.tsx
  src/components/ui/calendar2.tsx` (97 lines).
- **Not checked, by instruction:** no test, build, typecheck, dev server or Playwright run was
  performed for this investigation.
- **Knowledge graph:** `.understand-anything/` is at `fca5b10f` while HEAD is `d5497bdf`; it was
  used only to count incidental mentions (avatar 1, base-combobox 2, calendar2 3, pagination 1 file
  nodes), never as evidence. It regenerates and needs no manual edit.
