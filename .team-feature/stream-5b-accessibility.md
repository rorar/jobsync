# Sprint 2 Team Review — Accessibility Dimension

Review range: `a92aaf3..HEAD` (HEAD = `dc48f4b`) — Sprint 2 finding recovery.
Reviewer: Stream 5b / Accessibility dimension.
Method: read-only static review (no running server, no axe, no test runs).

## Summary

- Files reviewed: 18 of 31 TSX files touched in the diff (staging, automations, layout, settings, kanban, UI primitives) + scoped flashlight grep across the rest of `src/components/**`.
- HIGH findings: 7
- MEDIUM findings: 8
- LOW findings: 5
- Verified CRIT fixes (Sprint 1): **Y1, Y2, Y3 — all three verified in place**.
- Flashlight-effect findings (patterns matching CRIT-Y1/Y2/Y3 in OTHER files): **10** — see dedicated section.

### Verified CRIT fixes (Sprint 1)

- **CRIT-Y1 (target sizes)** — verified in `src/components/staging/DeckCard.tsx:97-115` (Info button now wraps a 28×28 visible pill in a 44×44 invisible hit area via `h-11 w-11` on the outer `<button>`) and in `src/components/staging/DeckView.tsx:378-451` (Block/Skip/Undo all `h-11 w-11`, Dismiss `h-14 w-14`, SuperLike `h-12 w-12`, Promote `h-16 w-16`). All four Sprint-1 target-size regressions are fixed.
- **CRIT-Y2 (color-only active state + redundant name)** — verified in `src/components/staging/StagingLayoutToggle.tsx:45-116`. Active radio now renders a `Check` glyph via `activeCheck` in addition to `bg-primary` (non-color indicator present), and the redundant sources were reduced to one — `aria-label` on the `<button role="radio">`. Arrow-key navigation + `tabIndex` roving is correct.
- **CRIT-Y3 (live-region name masking + keyboard orphan + focus pause)** — verified in `src/components/staging/SuperLikeCelebration.tsx:271-400`. The `role="status"` container no longer has a static `aria-label`; it uses `aria-labelledby={titleId subtitleId}` so the announcement contains both "Super-liked!" and the vacancy title. Programmatic mount focus moves to the CTA after the 280ms slide-in with a `skipNextFocusPauseRef` guard so the synthetic focus does NOT pause the auto-dismiss timer (WCAG 2.2.1). Global `document.keydown` Escape listener attached (not card-scoped). `motion-reduce:!transition-none` + `motion-reduce:!transform-none` respect `prefers-reduced-motion`.

---

## HIGH findings

### H-Y-01 — `MatchScoreRing` accessible name is hardcoded English + redundant with sr-only span

- **File:** `src/components/staging/MatchScoreRing.tsx:55-57`
- **Severity:** HIGH
- **Rule:** WCAG 3.1.1 (Language of Page) / WCAG 1.3.1 / WAI-ARIA APG "Accessible Name and Description Computation" + project i18n mandate ("every UI string must be translated")
- **Finding:** The new shared `MatchScoreRing` component was extracted in Sprint 2 commit `cbef375` ("refactor(staging): extract MatchScoreRing"). Its `aria-label` is literal English:
  ```tsx
  const ariaLabel = hasScore
    ? `Match score ${clamped} of 100`
    : "Match score not available";
  ```
  This is a regression introduced by the extraction — the pre-sprint inline SVG was `aria-hidden="true"` and the accessible name came from a translated `sr-only` sibling. Two consequences:
  1. Non-English locales hear "Match score 72 of 100" instead of "Trefferquote 72 von 100" / "Score de correspondance 72 sur 100" — violates WCAG 3.1.1 and the project's i18n rule.
  2. In `DeckCard.tsx:117-123` the ring is STILL accompanied by an sr-only translated span:
     ```tsx
     <span className="text-xs text-muted-foreground sr-only">
       {t("deck.matchScore")}: {vacancy.matchScore}%
     </span>
     <MatchScoreRing score={vacancy.matchScore} />
     ```
     So AT users hear the score TWICE (first in their locale via the sr-only span, then in English via the SVG's aria-label). This is the same "redundant accessible name source" anti-pattern CRIT-Y2 remediated — replicated in a different component.
- **Reproduction / rationale:** Enable a non-English locale, load the staging deck, focus a card, and listen with NVDA or VoiceOver. The screen reader will announce the match score twice — once in the user's locale, once in English.
- **Suggested fix direction:**
  1. Accept `ariaLabel` as a prop (or drop the `role="img"`/`aria-label` entirely and set `aria-hidden="true"`, making the SVG decorative — matching the pre-sprint behavior).
  2. If the ring is standalone (e.g. `StagedVacancyDetailContent.tsx:116` where there is NO sr-only sibling), the caller must provide a translated label.
  3. Pick one source of truth per call site. Remove the sr-only span in `DeckCard` if the ring is self-labeled, or make the ring decorative and keep the sr-only span. Do not keep both.

### H-Y-02 — `MatchScoreRing` in details sheet has ONLY the hardcoded English label (no sr-only fallback)

- **File:** `src/components/staging/StagedVacancyDetailContent.tsx:116`
- **Severity:** HIGH
- **Rule:** WCAG 3.1.1 (Language of Page) / WCAG 1.3.1 / project i18n mandate
- **Finding:** `<MatchScoreRing score={vacancy.matchScore} size={48} />` is rendered in the sheet header without any translated sibling. The only accessible name is the hardcoded English `aria-label` from H-Y-01. DE/FR/ES users get no translated score announcement.
- **Reproduction / rationale:** Set `NEXT_LOCALE=de`, open the details sheet, listen with NVDA. You will hear "Match score 82 of 100" in English mid-German dialog.
- **Suggested fix direction:** Fix H-Y-01 (pass `ariaLabel` via prop, compute it with `t("deck.matchScoreAria")` or similar in the caller). Same prop-based approach covers both call sites.

### H-Y-03 — Icon-only Accept/Dismiss buttons in `DiscoveredJobsList` have NO accessible name

- **File:** `src/components/automations/DiscoveredJobsList.tsx:196-219`
- **Severity:** HIGH
- **Rule:** WCAG 4.1.2 (Name, Role, Value) / WCAG 2.4.4 (Link Purpose) / ARIA APG "Button"
- **Finding:** Both buttons contain only a lucide icon (`<Check className="h-4 w-4" />` / `<X className="h-4 w-4" />`). No `aria-label`, no `title`, no visible text, no `sr-only` child. `lucide-react` SVG icons have no default `role` or name, so the buttons get an empty accessible name — screen readers announce "button" with nothing else.
  ```tsx
  <Button size="sm" variant="outline" onClick={() => handleAccept(job.id)} disabled={isLoading}>
    {isLoading ? <Loader2 ... /> : <Check className="h-4 w-4" />}
  </Button>
  ```
  This file WAS touched in Sprint 2 (commit `fe4fba1`) to replace `Building2` with `CompanyLogo` and to fix `job.status`/`job.discoveryStatus` drift. The accessibility bug is pre-existing but in-scope per the flashlight-effect mandate, and the file was edited in Sprint 2 without addressing it.
- **Reproduction / rationale:** Focus the action column of a staged discovered-job row with NVDA or VoiceOver — both buttons announce as "button" with nothing to disambiguate them.
- **Suggested fix direction:**
  ```tsx
  <Button size="sm" variant="outline" onClick={...} disabled={isLoading}
    aria-label={t("automations.discoveredJob.acceptButton")}>
    ...
  </Button>
  ```
  Apply to both Accept and Dismiss. Add `aria-hidden="true"` to the icon children (they are decorative once the button has a label).

### H-Y-04 — Icon-only external-link anchors in `DiscoveredJobsList` and `DiscoveredJobDetail` have NO accessible name

- **File:** `src/components/automations/DiscoveredJobsList.tsx:144-153`, `src/components/automations/DiscoveredJobDetail.tsx:108-117`
- **Severity:** HIGH
- **Rule:** WCAG 2.4.4 (Link Purpose in Context), WCAG 4.1.2 (Name, Role, Value)
- **Finding:** Both files render an external-link `<a>` whose only child is `<ExternalLink className="h-4 w-4" />`. No `aria-label`, no visible text, no `sr-only` label, no `title`. The link is reachable by Tab and focusable, but the screen reader announces just "link" with no destination hint.
  ```tsx
  <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
     className="text-muted-foreground hover:text-foreground">
    <ExternalLink className="h-4 w-4" />
  </a>
  ```
- **Reproduction / rationale:** Tab into the jobs table or the details dialog, land on the external-link icon, listen with NVDA. Output: "link" (no purpose). WCAG 2.4.4 explicitly requires that the purpose of each link can be determined from the link text alone (or combined with programmatically determined context).
- **Suggested fix direction:**
  ```tsx
  <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
     aria-label={t("automations.discoveredJob.openOnSource")}
     className="...">
    <ExternalLink className="h-4 w-4" aria-hidden="true" />
  </a>
  ```
  Add a translation key for "Open on source (new tab)" or similar; also add `aria-hidden="true"` on the icon so it is not double-announced.

### H-Y-05 — Clickable `<span>` job title in `DiscoveredJobsList` is keyboard-orphaned

- **File:** `src/components/automations/DiscoveredJobsList.tsx:138-143`
- **Severity:** HIGH
- **Rule:** WCAG 2.1.1 (Keyboard), WCAG 4.1.2 (Name, Role, Value), ARIA APG "Button vs Link"
- **Finding:** The job title in the table is rendered as:
  ```tsx
  <span className="font-medium hover:underline cursor-pointer"
        onClick={() => onViewDetails?.(job)}>
    {jobTitle}
  </span>
  ```
  A `<span>` with `onClick` is NOT keyboard accessible — no `tabIndex`, no `onKeyDown`, no `role="button"`. Keyboard users cannot open the details dialog by tabbing into the title; mouse users can. This is a WCAG 2.1.1 / Level A violation. There is no alternative keyboard path to `onViewDetails` in this row (the external link goes to a different destination, and the Accept/Dismiss buttons do not open details). Unlike `StagedVacancyCard` (where a separate Details button is provided as the keyboard-accessible alternative — see finding L-Y-01), there is no fallback here.
- **Reproduction / rationale:** Navigate the table with Tab only. The Accept/Dismiss/external-link controls are reachable, but the title opener is not.
- **Suggested fix direction:** Replace with a native `<button type="button">` styled as text, or add `tabIndex={0}`, `role="button"`, and an `onKeyDown` that handles Enter/Space:
  ```tsx
  <button type="button"
          className="font-medium hover:underline text-left"
          onClick={() => onViewDetails?.(job)}>
    {jobTitle}
  </button>
  ```

### H-Y-06 — `StagingLayoutToggle` Check-indicator pattern is NOT propagated to `ViewModeToggle` / `KanbanViewModeToggle` (CRIT-Y2 flashlight)

- **File:** `src/components/staging/ViewModeToggle.tsx:43-85`, `src/components/kanban/KanbanViewModeToggle.tsx:37-84`
- **Severity:** HIGH
- **Rule:** WCAG 1.4.1 (Use of Color), WCAG 1.4.11 (Non-text Contrast), WAI-ARIA Authoring Practices "Radio Group"
- **Finding:** Both sibling toggles use the EXACT same ARIA pattern as the fixed `StagingLayoutToggle` (`<div role="radiogroup">` with `<button role="radio" aria-checked>` children) and the EXACT same active-state visual (`bg-primary text-primary-foreground shadow-sm`). Neither has the `Check` overlay that CRIT-Y2 added to `StagingLayoutToggle` as the non-color indicator. The CRIT-Y2 commit message explicitly called out the sibling risk:
  > "Sibling-pattern risk noted in CRIT-Y2 commit"
- Unlike `StagingLayoutToggle` whose buttons were originally icon-only (where color was the ONLY cue), `ViewModeToggle` and `KanbanViewModeToggle` DO render visible text labels ("List" / "Deck", "Table" / "Kanban") next to the icons. The text label alone makes the button identifiable regardless of active state, so WCAG 1.4.1 is NOT cleanly violated — but the visual "selected" state of the radio group is still conveyed only by color, which:
  - Fails in Windows High Contrast / forced-colors mode (bg-primary becomes a system color, the selected button stops looking selected).
  - Fails WCAG 1.4.11 (Non-text Contrast) if the active `bg-primary` vs inactive `bg-background` contrast falls below 3:1 in user-custom color schemes.
  - Is inconsistent with the sibling `StagingLayoutToggle` fix — a confused user comparing the three toggles side-by-side sees two different conventions for the same UX primitive.
- **Reproduction / rationale:** Open `/dashboard/staging` or `/dashboard/myjobs` in Windows High Contrast mode. The active toggle button loses its distinct background and becomes visually indistinguishable from its siblings (the `aria-checked` programmatic state is still announced to AT, but sighted keyboard users with low vision see no selection).
- **Suggested fix direction:** Replicate the `activeCheck` overlay from `StagingLayoutToggle.tsx:62-68`:
  ```tsx
  const activeCheck = (
    <Check className="pointer-events-none absolute right-0.5 top-0.5 h-2.5 w-2.5 stroke-[3]"
           aria-hidden="true" />
  );
  ```
  and render it conditionally inside the active button alongside the existing text label. Add `relative` to the button class so the absolute positioning anchors correctly.

### H-Y-07 — Dashboard toggles (`RecentCardToggle`, `NumberCardToggle`, `WeeklyBarChartToggle`) have no ARIA semantics AND color-only active state

- **File:** `src/components/dashboard/RecentCardToggle.tsx:46-63`, `src/components/dashboard/NumberCardToggle.tsx:39-56`, `src/components/dashboard/WeeklyBarChartToggle.tsx:67-84`
- **Severity:** HIGH
- **Rule:** WCAG 1.3.1 (Info and Relationships), WCAG 1.4.1 (Use of Color), WCAG 4.1.2 (Name, Role, Value), WAI-ARIA APG "Tab" or "Radio Group"
- **Finding:** Three dashboard cards use a plain `<button>` group with only `activeIndex === index ? "bg-primary text-primary-foreground" : "hover:bg-muted"`. There is NO `role`, NO `aria-selected`, NO `aria-pressed`, NO `aria-current`. Screen reader users cannot tell which tab is active because the active state has no programmatic representation. This is strictly WORSE than the pre-fix `StagingLayoutToggle` state — the dashboard toggles don't even have `role="radiogroup"`/`role="radio"` scaffolding.
  ```tsx
  <button key={tab} onClick={() => setActiveIndex(index)}
    className={cn(..., activeIndex === index ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
    {tab}
  </button>
  ```
  These files are NOT in the Sprint 2 diff, but they are flashlight-effect siblings of CRIT-Y2 and the user's scope explicitly mandated checking "any other color-only state indicators in other toggles".
- **Reproduction / rationale:** Open the dashboard with NVDA. Tab through the three card toggles. Each button announces as "button" (no selected state). Also, in forced-colors mode, the active state becomes invisible.
- **Suggested fix direction:** Decide whether the pattern is a Tablist or a Radio Group:
  - **Tablist** (recommended — the button switches the content below): use `role="tablist"` / `role="tab"` with `aria-selected`, `aria-controls`, and tabpanel association. Manage `tabIndex={-1}/0` roving. Add the Check overlay for the non-color indicator.
  - **Radio Group** (if the buttons represent a choice, not a view switch): mirror `StagingLayoutToggle` exactly.

---

## MEDIUM findings

### M-Y-01 — `StagedVacancyCard` footer action buttons are 28×28 — fails WCAG 2.5.5 AAA (CRIT-Y1 flashlight)

- **File:** `src/components/staging/StagedVacancyCard.tsx:192-326`
- **Severity:** MEDIUM
- **Rule:** WCAG 2.5.5 AAA (Target Size — 44×44)
- **Finding:** All footer actions (Details, Promote, Dismiss, Archive, Trash, Block, Restore) are `<Button size="sm" className="h-7 gap-1 text-xs">` — `h-7` = 28 px. This is the SAME pattern CRIT-Y1 fixed on `DeckCard` and `DeckView` — a visible control below 44×44. The Sprint-1 fix did NOT propagate to list-mode cards even though list-mode is a primary interaction path. 28×28 passes WCAG 2.5.8 AA (24×24 floor) but fails 2.5.5 AAA. Given that CRIT-Y1 was remediated at AAA on the deck-mode twin, the same AAA bar applies here for consistency.
- **Reproduction / rationale:** Open staging in list mode, measure any footer button with devtools. Width varies by label but height is always 28 px.
- **Suggested fix direction:** Raise to `h-11` (44 px), OR wrap the visible `h-7` button in a 44×44 invisible hit-area per the CRIT-Y1 pattern used on `DeckCard.tsx:97-115`. The visible pill can stay at `h-7` for information density, but the focusable/pointer target should be 44×44.

### M-Y-02 — `NotificationItem` dismiss button is 32×32 — fails WCAG 2.5.5 AAA (CRIT-Y1 flashlight)

- **File:** `src/components/layout/NotificationItem.tsx:249-261`
- **Severity:** MEDIUM
- **Rule:** WCAG 2.5.5 AAA (Target Size — 44×44)
- **Finding:** Icon-only `Button variant="ghost" size="icon" className="h-8 w-8"` (32×32). Same 2.5.5 AAA failure as CRIT-Y1. Additionally, this button is hidden on desktop (`md:opacity-0`) until hover/focus — which is fine for keyboard (`group-focus-within:opacity-100` reveals it on Tab) but a sighted-mouse user must position precisely into a 32×32 target after an opacity animation.
- **Suggested fix direction:** `h-11 w-11` (44×44), OR wrap the 32×32 visible pill in a 44×44 invisible hit area per CRIT-Y1. Same treatment for the Mark-all-read button at `NotificationDropdown.tsx:184-194` (also `h-8 w-8`).

### M-Y-03 — `NotificationDropdown` mark-all-read button is 32×32 (CRIT-Y1 flashlight)

- **File:** `src/components/layout/NotificationDropdown.tsx:184-194`
- **Severity:** MEDIUM
- **Rule:** WCAG 2.5.5 AAA (Target Size)
- **Finding:** Same pattern as M-Y-02 — `className="h-8 w-8 shrink-0"` on a ghost icon button with only a `CheckCheck` icon child. Same fix direction.

### M-Y-04 — `ApiStatusOverview` per-row health-check button is 32×32 (CRIT-Y1 flashlight)

- **File:** `src/components/settings/ApiStatusOverview.tsx:367-380`
- **Severity:** MEDIUM
- **Rule:** WCAG 2.5.5 AAA (Target Size)
- **Finding:** `Button size="sm" variant="ghost" className="h-8 w-8 p-0"` in each `ModuleStatusRow`. Same flashlight finding.

### M-Y-05 — `KanbanCard` drag handle is ~20×20 — fails both 2.5.5 AAA AND 2.5.8 AA (CRIT-Y1 flashlight)

- **File:** `src/components/kanban/KanbanCard.tsx:71-83`
- **Severity:** MEDIUM (would be HIGH if this were a touch-primary surface, but kanban DnD is keyboard-assisted via `@dnd-kit`'s sensors)
- **Rule:** WCAG 2.5.5 AAA (44×44), WCAG 2.5.8 AA (24×24)
- **Finding:** The drag handle is:
  ```tsx
  <button type="button"
          className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing touch-none
                     text-muted-foreground/50 hover:text-muted-foreground
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                     rounded p-0.5">
    <GripVertical className="h-4 w-4" aria-hidden="true" />
  </button>
  ```
  `h-4 w-4` = 16 px icon with `p-0.5` = 2 px padding on each side ≈ 20 px total target. Below BOTH the 2.5.5 AAA (44) and 2.5.8 AA (24) thresholds. On touch devices, grabbing this tiny handle to initiate drag is extremely difficult.
- **Suggested fix direction:** `p-2` (adds 8 px each side → 32 px, passes 2.5.8 AA) or `p-3` (40 px), or better: invisible 44×44 hit-area wrapping the 16 px glyph. Note: the `@dnd-kit` library attaches `listeners` to this element, so the hit area matters for pointer drag initiation.

### M-Y-06 — `Button size="icon"` default is 40×40 — fails 2.5.5 AAA (codebase baseline, flashlight)

- **File:** `src/components/ui/button.tsx:26`
- **Severity:** MEDIUM (baseline design-token issue)
- **Rule:** WCAG 2.5.5 AAA (Target Size)
- **Finding:** The Button component's `size="icon"` variant is hardcoded to `h-10 w-10` (40×40). This flows through to every `<Button size="icon">` instance in the app (36+ call sites per grep) and creates a consistent-but-sub-AAA baseline. Since Sprint 1 committed to the 44×44 AAA bar on the deck, keeping the global icon-size default at 40×40 creates a split: deck is AAA, everything else is below. Not a regression, but a flashlight candidate after CRIT-Y1.
- **Suggested fix direction:** Raise the `icon` variant default to `h-11 w-11`, verify callers that also override `className="h-8 w-8"` still compose correctly (the latter should be eliminated per M-Y-02 through M-Y-04).

### M-Y-07 — `NotificationBell` badge count change is never announced (no live region)

- **File:** `src/components/layout/NotificationBell.tsx:54-73`
- **Severity:** MEDIUM
- **Rule:** WCAG 4.1.3 (Status Messages), WAI-ARIA live regions
- **Finding:** The 30-second polling updates `unreadCount` and re-renders the badge `<span>` with the new number. The `aria-label` on the Button is updated (`"3 Notifications"`), but `aria-label` changes are ONLY announced when the element currently has focus. Users who are NOT focused on the bell will never hear that new notifications arrived. The badge `<span>` itself has no `aria-live` so AT receives no update.
- **Suggested fix direction:** Either wrap the badge in a polite live region:
  ```tsx
  <span className="absolute -top-1 -right-1 ..." aria-live="polite" aria-atomic="true">
    {displayCount}
  </span>
  ```
  (announces "5" when the count changes), OR add a separate `<div aria-live="polite" className="sr-only">` that sibling of the bell that fires `t("notifications.newArrived", { count: displayCount })` on count-increase only. The first is simpler but noisy (announces every change including decrement); the second is more polished. Be aware that `aria-live` on a badge containing only a number may announce as a bare digit — prefer wrapping with a full sentence via sr-only text.

### M-Y-08 — Skeleton loaders use hardcoded English `aria-label="Loading"`

- **File:** `src/components/enrichment/EnrichmentStatusPanel.tsx:90`, `src/components/crm/StatusHistoryTimeline.tsx:55`
- **Severity:** MEDIUM
- **Rule:** WCAG 3.1.1 (Language of Page) + project i18n mandate
- **Finding:** Both skeleton components use `role="status" aria-label="Loading"` — hardcoded English string. DE/FR/ES users hear "Loading" verbatim mid-sentence.
- **Suggested fix direction:** `aria-label={t("common.loading")}` — key already exists.

---

## LOW findings

### L-Y-01 — Clickable card body in `StagedVacancyCard` uses `role="presentation"` with `onClick` and no keyDown

- **File:** `src/components/staging/StagedVacancyCard.tsx:88-96`
- **Severity:** LOW (keyboard alternative exists via the Details footer button — WCAG 2.1.1 is satisfied by the alternative)
- **Rule:** WCAG 2.1.1 (Keyboard), ESLint `jsx-a11y/click-events-have-key-events`
- **Finding:** The card body wrapper is `<div role="presentation" onClick={handleBodyClick} className="cursor-pointer hover:bg-muted/40">`. Mouse users get a large click target; keyboard users must use the explicit Details button in the footer (`StagedVacancyCard.tsx:191-205`). The `role="presentation"` explicitly removes semantics so AT does not announce the div as interactive. The alternative path exists, so this is conformant-by-alternative but leaves a lingering a11y smell.
- **Suggested fix direction:** Acceptable as-is given the Details fallback button. Document the decision in a code comment so future edits do not inadvertently remove the fallback button. Alternatively, drop the `role="presentation" onClick` entirely and make ONLY the Details button open the sheet.

### L-Y-02 — `StagingNewItemsBanner` puts an interactive Button inside `role="status"` live region

- **File:** `src/components/staging/StagingNewItemsBanner.tsx:46-61`
- **Severity:** LOW
- **Rule:** WAI-ARIA APG "live regions" — interactive descendants inside polite status containers can cause noisy announcements
- **Finding:** `<div role="status">` wraps both the "New items available" text AND a "Show new items" button. When the banner mounts, screen readers will announce the full subtree (including the button label). This is allowed by spec but creates a noisier announcement than necessary.
- **Suggested fix direction:** Move `role="status"` to a narrower inner wrapper around just the text span:
  ```tsx
  <div className="...">
    <span role="status">{t("automations.newItemsAvailable")}</span>
    <Button ...>{t("automations.showNewItems")}</Button>
  </div>
  ```

### L-Y-03 — `NotificationItem` unread indicator sr-only content is a bullet character

- **File:** `src/components/layout/NotificationItem.tsx:200-205`
- **Severity:** LOW
- **Rule:** WCAG 1.3.1 (Info and Relationships)
- **Finding:** The unread state is communicated visually by a colored dot; the AT fallback is:
  ```tsx
  <span className="sr-only">•</span>
  ```
  NVDA reads "bullet"; VoiceOver reads it variably. A semantic unread label is missing. The `<article>` has no `aria-labelledby` addition or `aria-description` conveying unread-ness, and the visual-only border-left (`border-l-2 border-l-primary`) is also color-only.
- **Suggested fix direction:** Replace with `<span className="sr-only">{t("notifications.unread")}</span>` (add key). Stronger: add `aria-describedby` pointing at a sr-only span that says "unread" so the article's accessible description includes the state.

### L-Y-04 — `DiscoveredJobsList` renders `job.status` as raw English enum string

- **File:** `src/components/automations/DiscoveredJobsList.tsx:187`
- **Severity:** LOW (i18n leakage more than a11y, but it propagates into the accessible name of the Badge)
- **Rule:** project i18n mandate / WCAG 3.1.1
- **Finding:** `<Badge>{job.status}</Badge>` — renders the raw enum (e.g. `"staged"`, `"ready"`, `"dismissed"`). The Badge has no explicit accessible name override, so screen readers read the enum verbatim. In `DiscoveredJobDetail.tsx:56-61` the same enum is translated via `t('automations.discoveredJob.status.${job.status}')` — the list view missed the translation path.
- **Suggested fix direction:** Use the same translation helper as `DiscoveredJobDetail`:
  ```tsx
  const statusLabel = (() => {
    if (!job.status) return "";
    const key = `automations.discoveredJob.status.${job.status}`;
    const translated = t(key);
    return translated === key ? job.status : translated;
  })();
  ```

### L-Y-05 — `MatchScoreRing` stroke color `stroke-amber-500` on white may fail WCAG 1.4.11

- **File:** `src/components/staging/MatchScoreRing.tsx:42-47`
- **Severity:** LOW (the textual score is still readable, so WCAG 1.4.3 passes; 1.4.11 covers non-text UI)
- **Rule:** WCAG 1.4.11 (Non-text Contrast — 3:1 for UI components)
- **Finding:** `stroke-amber-500` is Tailwind `#f59e0b`. On a white card background, the contrast ratio is ≈ 2.15:1, below the 3:1 non-text UI threshold. The ring stroke is a UI indicator (progress-meter style) and not text, so 1.4.11 applies. The text in the center uses `text-amber-700` which is ~4.95:1 — passes 1.4.3 AA for text.
- **Suggested fix direction:** Use `stroke-amber-600` (`#d97706`, ~4.02:1 on white) for the 40-59 range. Similarly verify emerald/blue/red stroke colors against the background under light and dark modes.

---

## Flashlight-effect findings (patterns that matched CRIT-Y* in OTHER files)

All of the following replicate Sprint-1 CRIT-Y* patterns in files that were NOT touched by the Sprint-1 remediation commits. They are listed with pointers to their detailed entries above.

| # | Pattern from Sprint 1 | File | Severity | Entry |
|---|---|---|---|---|
| 1 | Y2: color-only active state on toggle | `src/components/staging/ViewModeToggle.tsx:43-85` | HIGH | H-Y-06 |
| 2 | Y2: color-only active state on toggle | `src/components/kanban/KanbanViewModeToggle.tsx:37-84` | HIGH | H-Y-06 |
| 3 | Y2: color-only active + no ARIA role at all | `src/components/dashboard/RecentCardToggle.tsx:46-63` | HIGH | H-Y-07 |
| 4 | Y2: color-only active + no ARIA role at all | `src/components/dashboard/NumberCardToggle.tsx:39-56` | HIGH | H-Y-07 |
| 5 | Y2: color-only active + no ARIA role at all | `src/components/dashboard/WeeklyBarChartToggle.tsx:67-84` | HIGH | H-Y-07 |
| 6 | Y1: interactive control below 44×44 | `src/components/staging/StagedVacancyCard.tsx:192-326` (h-7 / 28 px) | MEDIUM | M-Y-01 |
| 7 | Y1: interactive control below 44×44 | `src/components/layout/NotificationItem.tsx:249-261` (h-8 w-8 / 32 px) | MEDIUM | M-Y-02 |
| 8 | Y1: interactive control below 44×44 | `src/components/layout/NotificationDropdown.tsx:184-194` (h-8 w-8 / 32 px) | MEDIUM | M-Y-03 |
| 9 | Y1: interactive control below 44×44 | `src/components/settings/ApiStatusOverview.tsx:367-380` (h-8 w-8 / 32 px) | MEDIUM | M-Y-04 |
| 10 | Y1: interactive control below 44×44 | `src/components/kanban/KanbanCard.tsx:71-83` (~20 px drag handle) | MEDIUM | M-Y-05 |
| 11 | Y1: codebase-wide baseline | `src/components/ui/button.tsx:26` (`size="icon"` → 40×40) | MEDIUM | M-Y-06 |
| 12 | Y3: aria-label on role="status" (harmless subtype — skeleton) | `src/components/enrichment/EnrichmentStatusPanel.tsx:90` | MEDIUM | M-Y-08 |
| 13 | Y3: aria-label on role="status" (harmless subtype — skeleton) | `src/components/crm/StatusHistoryTimeline.tsx:55` | MEDIUM | M-Y-08 |

**No Y3 "aria-label masking live-region content" pattern was found elsewhere.** The two `role="status" aria-label="Loading"` sites ARE the Y3 structural pattern, but because they wrap only decorative skeleton divs (no user-facing content that could be masked), they don't mask content. The `aria-label` hardcoded-English issue there is an i18n finding, not a content-masking finding.

**No other Y3 keyboard-orphaned modal/popover mount-focus pattern was found.** `SuperLikeCelebration` was the only auto-mounting non-Radix popup in the changed scope. All other modals (`StagedVacancyDetailSheet`, `PromotionDialog`, `BlockConfirmationDialog`, `NotificationBell` Sheet) use Radix primitives which handle focus management correctly.

---

## Out-of-scope notes

- **Axe / axe-core / pa11y / Lighthouse NOT run.** Per the Sprint 2 hard constraints, no running server was started. The findings above are from static review only. Actual SR-specific behavior (e.g. VoiceOver vs. NVDA vs. JAWS differences) should be verified by manual AT walkthroughs after fixes land.
- **forced-colors / Windows High Contrast mode:** The codebase has zero `@media (forced-colors: active)` rules (grep confirmed). This is a baseline gap that affects all color-indicated states in the app, not just Sprint 2. Consider a dedicated sweep to add `SystemColors` fallbacks — but that is out of scope for Sprint 2 recovery.
- **Color contrast (WCAG 1.4.3) audit of badge variants:** Not performed numerically. Sampled `bg-amber-100 text-amber-800` on cards and `bg-destructive text-destructive-foreground` on the notification bell — both pass spot checks. A full contrast audit (all badge variants × light/dark × forced-colors) should be scheduled as a separate sprint.
- **E2E keyboard tests:** `__tests__/a11y-deck-view.spec.tsx` exists (new in Sprint 2 commit `4a7b917`) and appears to cover Escape-co-existence between the deck and the celebration fly-in. The test infrastructure did not run (per hard constraint), but existence is noted as a positive signal for CRIT-Y3 regression protection.
- **`use-media-query` hook SSR safety:** Reviewed `src/hooks/use-media-query.ts` — starts `false` during SSR, hydrates on mount. Consumers in `StagedVacancyDetailSheet` and `NotificationBell` may briefly render the mobile layout on first paint on desktop. This is a visual-flash concern, not an a11y finding.
- **`useDeckStack` keyboard shortcuts (d/p/s/b/n/z) vs WCAG 2.1.4 (Character Key Shortcuts):** WCAG 2.1.4 exempts single-character shortcuts that are "only active when a relevant user interface component has focus". The deck checks `container.contains(target)` before handling, AND the container has `tabIndex={0}` and `role="region"` with `aria-label`. Conformant.
- **New `aria-live` sr-only lastAction banner in `DeckView` (line 543-545):** `<div aria-live="assertive" aria-atomic="true" className="sr-only">{lastAction}</div>`. The `assertive` level interrupts other announcements; consider `polite` unless immediate interruption is critical — the deck actions are not errors. Minor — not flagged as a finding because the spec does allow assertive for user-initiated action confirmations.

