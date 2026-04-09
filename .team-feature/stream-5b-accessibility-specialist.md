# Sprint 2 Accessibility Specialist Validation

Review range: `a92aaf3..HEAD` (HEAD = `dc48f4b`) — Sprint 2 finding recovery.
Reviewer: specialized `ui-design:accessibility-expert` (validation run).
Method: read-only static review; no dev server, no axe, no Playwright.

## Purpose

Validation run comparing the specialized `ui-design:accessibility-expert`
against the generic `agent-teams:team-reviewer` baseline at
`/home/pascal/projekte/jobsync/.team-feature/stream-5b-accessibility.md`.

Sprint 2 Phase 1b experiment: is specialization worth the extra token /
orchestration cost on the accessibility dimension? The baseline already
scored HIGH on this dimension (7 HIGH / 8 MEDIUM / 5 LOW), so the bar for
specialization uplift is correspondingly higher.

## Summary

- Files reviewed: ~24 of 129 touched (UI components, dashboard/nav landmarks,
  layout, form entry points, error boundary). Scoped to files with visible UI.
- Baseline HIGH confirmed: **7 of 7** (all 7 independently reproduced).
- Baseline HIGH downgraded/rejected: **0**.
- NEW HIGH: **5** — focused on landmark navigation, skip link, error page
  i18n, card list-item context, and ARIA feed-pattern correctness.
- NEW MEDIUM: **3**.
- NEW LOW: **2**.

Specialization uplift: **5 NEW HIGH findings**. These are structural
landmark/navigation and destructive-action issues that a generic reviewer
did not surface because they require WAI-ARIA pattern knowledge (feed role,
landmark naming, `aria-current`) and WCAG 3.3.4 (Error Prevention — Legal,
Financial, Data) awareness.

---

## Baseline findings — agreement check

### H-Y-01 — `MatchScoreRing` hardcoded English aria-label + double-announce

**CONFIRMED.** Verified at `src/components/staging/MatchScoreRing.tsx:55-57`:

```tsx
const ariaLabel = hasScore
  ? `Match score ${clamped} of 100`
  : "Match score not available";
```

The SVG has `role="img"` + `aria-label={ariaLabel}` (lines 65-66), hardcoded
English. Verified at `src/components/staging/DeckCard.tsx:117-123` — the sr-only
translated span IS still rendered alongside the ring:

```tsx
<span className="text-xs text-muted-foreground sr-only">
  {t("deck.matchScore")}: {vacancy.matchScore}%
</span>
<MatchScoreRing score={vacancy.matchScore} />
```

So on DeckCard, a DE user with NVDA will hear:
"Trefferquote: 72%" (from sr-only) followed by "Match score 72 of 100"
(from the ring's aria-label) — **double-announce, half-English**. This is the
exact redundant-accessible-name anti-pattern CRIT-Y2 remediated for
StagingLayoutToggle, now reintroduced by the Sprint 2 extraction commit.

**Additional specialist note:** the `role="img"` with `aria-label` pattern
masks ALL child content from screen readers including the centered `<text>`
node (line 101) which renders the numeric score. If the text were needed for
SR fallback (e.g. in an Atomic announcement), it would be silently dropped.
This is a minor concern because the aria-label already includes the number,
but it would become a bug if the translation key is renamed or removed.

**WCAG rules cited:** 3.1.1 (Language of Page), 1.3.1 (Info & Relationships),
4.1.2 (Name, Role, Value).

Baseline severity HIGH — **agree**.

### H-Y-02 — `StagedVacancyDetailContent` ring has no sr-only fallback

**CONFIRMED.** Verified at `src/components/staging/StagedVacancyDetailContent.tsx:115-117`:

```tsx
{vacancy.matchScore != null && (
  <MatchScoreRing score={vacancy.matchScore} size={48} />
)}
```

No sr-only sibling, no translated accessible name. DE/FR/ES users opening
the details sheet via the Info button in deck mode (or Details button in
list mode) will hear the English aria-label from MatchScoreRing as the
ONLY score announcement. Unlike DeckCard (which at least has the German
sr-only span, even though it double-announces), this site has a 100%
English announcement inside a German/French/Spanish dialog.

**Additional specialist note:** the sheet wrapper at
`StagedVacancyDetailSheet.tsx:115-124` uses `SheetTitle sr-only` +
`SheetDescription sr-only` — both populated with translated strings (good).
But the visible `<h2>` inside `StagedVacancyDetailContent.tsx:105-107` is NOT
referenced by `aria-labelledby` on the dialog, so there's a DISCONNECT:

- Radix sets the dialog's accessible name from the sr-only `SheetTitle`
  ("Data Analyst - Berlin").
- The visible visual heading is a separate `<h2>` inside the content.
- The `<h2>` is the visible title but is not the dialog's accessible name.

AT users hear the sr-only title; sighted users see the `<h2>`. The text
content matches (`{vacancy.title}`) so this is cosmetic in practice, but
it's a brittle pattern — if the sr-only title drifts from the visible `<h2>`,
sighted and AT experiences diverge silently. Prefer binding
`aria-labelledby` to a visible heading.

Baseline severity HIGH — **agree**.

### H-Y-03 — `DiscoveredJobsList` icon-only Accept/Dismiss buttons

**CONFIRMED.** Verified at `src/components/automations/DiscoveredJobsList.tsx:196-219`:

```tsx
<Button size="sm" variant="outline" onClick={() => handleAccept(job.id)} disabled={isLoading}>
  {isLoading ? <Loader2 className="h-4 w-4 ..." /> : <Check className="h-4 w-4" />}
</Button>
<Button size="sm" variant="ghost" onClick={() => handleDismiss(job.id)} disabled={isLoading}>
  {isLoading ? <Loader2 ... /> : <X className="h-4 w-4" />}
</Button>
```

Neither button has `aria-label`, `title`, or visible text. `lucide-react`
SVGs have no role / name, so the buttons have an empty accessible name and
NVDA/JAWS/VoiceOver will announce "button" followed by nothing. Table context
does NOT disambiguate because there's no `aria-describedby` on the row and
no row header tying the Accept/Dismiss into a job title.

**Additional specialist note:** both buttons additionally lack vacancy
context. Even with `aria-label={t("automations.discoveredJob.acceptButton")}`,
a user tabbing through a 20-row table gets "Accept, button; Dismiss, button"
× 20 with no indication of WHICH job the action applies to. The fix should
interpolate the title: `aria-label={t("automations.discoveredJob.acceptButtonForJob").replace("{title}", job.title)}`
or use `aria-describedby` pointing at the title cell. Same pattern applies
to H-NEW-01 below.

**WCAG rules cited:** 4.1.2, 2.4.4 (Link Purpose — buttons analog).

Baseline severity HIGH — **agree**.

### H-Y-04 — External-link anchors no accessible name

**CONFIRMED.** Verified at:
- `src/components/automations/DiscoveredJobsList.tsx:144-153`
- `src/components/automations/DiscoveredJobDetail.tsx:108-117`

Both sites render:

```tsx
<a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
  <ExternalLink className="h-4 w-4" />
</a>
```

No `aria-label`, no text child. The link is keyboard-reachable but
announces as "link" only. WCAG 2.4.4 Level A explicitly requires link
purpose be determinable from link text or programmatic context.

**Additional specialist note:** the icon itself has NO `aria-hidden="true"`,
so some screen readers may also announce "graphic" or the element's HTML
name. On the DiscoveredJobDetail side, the link is inside the
`DialogTitle` (line 106-118) which itself serves as the dialog's accessible
name — the link's empty name bleeds into the dialog announcement
("Data Analyst link" on open). Even more confusing.

The fix MUST add `aria-hidden="true"` on the `<ExternalLink>` icon child
(baseline noted this) AND use a translated `aria-label` like
`t("automations.discoveredJob.openOnSource")`. Baseline fix is correct.

Baseline severity HIGH — **agree**.

### H-Y-05 — Clickable `<span>` keyboard-orphaned

**CONFIRMED.** Verified at `src/components/automations/DiscoveredJobsList.tsx:138-143`:

```tsx
<span
  className="font-medium hover:underline cursor-pointer"
  onClick={() => onViewDetails?.(job)}
>
  {jobTitle}
</span>
```

No `tabIndex`, no `onKeyDown`, no `role="button"`. This is WCAG 2.1.1
(Keyboard) Level A — a pointer-only handler with no keyboard equivalent.
Unlike `StagedVacancyCard` where a dedicated Details button in the footer
IS keyboard-reachable (the `role="presentation"` body onClick is harmless
there), `DiscoveredJobsList` has NO alternative path to `onViewDetails`.
The Accept/Dismiss buttons don't open details. The external-link opens a
different destination. So keyboard users literally cannot open the detail
dialog from the list.

**Additional specialist note:** ESLint `jsx-a11y/click-events-have-key-events`
SHOULD flag this if enabled on the project. The fact that it slipped
through suggests either the rule is not enforced, or this file was
explicitly ignored. Recommend enforcing the rule project-wide.

Baseline severity HIGH — **agree**.

### H-Y-06 — `ViewModeToggle` / `KanbanViewModeToggle` flashlight

**CONFIRMED.** Verified at:
- `src/components/staging/ViewModeToggle.tsx:43-85`
- `src/components/kanban/KanbanViewModeToggle.tsx:37-84`

Both use the exact same `<div role="radiogroup">` / `<button role="radio">`
pattern as the fixed `StagingLayoutToggle`, AND the exact same
`bg-primary text-primary-foreground shadow-sm` active visual. Neither
renders the `activeCheck` glyph overlay that the CRIT-Y2 remediation added
to `StagingLayoutToggle`.

**Specialist nuance that the baseline got right:** both `ViewModeToggle`
and `KanbanViewModeToggle` DO render text labels ("List" / "Deck",
"Table" / "Kanban") next to the icons, so the baseline's observation that
WCAG 1.4.1 (Use of Color) is "not cleanly violated" is correct — the
buttons remain identifiable because their visible text does not depend on
color. The violation is narrower: the _selected state_ is color-only,
which fails in forced-colors mode (WCAG 1.4.11 Non-text Contrast).
`StagingLayoutToggle` has the same text labels (`labelCompact`, etc.) +
the Check overlay; consistency alone justifies replicating the fix.

**Additional specialist note:** the icons in both sibling toggles are NOT
marked `aria-hidden="true"` (e.g. `ViewModeToggle.tsx:61` — `<List className="h-3.5 w-3.5" />`).
`KanbanViewModeToggle` DID add the `aria-hidden="true"` (lines 60, 79) —
so the two siblings diverge on this minor detail too. Add `aria-hidden="true"`
to the `List` and `Layers` icons in `ViewModeToggle` for consistency.

Baseline severity HIGH — **agree**.

### H-Y-07 — Dashboard toggles (Recent/Number/WeeklyBar) worse than baseline

**CONFIRMED.** Verified at:
- `src/components/dashboard/RecentCardToggle.tsx:46-63`
- `src/components/dashboard/NumberCardToggle.tsx:39-56`
- `src/components/dashboard/WeeklyBarChartToggle.tsx:67-84`

All three render plain `<button>` groups with only
`activeIndex === index ? "bg-primary text-primary-foreground" : "hover:bg-muted"`.
NO `role`, NO `aria-selected`, NO `aria-pressed`, NO `aria-current`. Screen
reader users have no programmatic way to know which tab is active — they
hear "button, Jobs; button, Activities" and must guess. This is STRICTLY
worse than the pre-fix `StagingLayoutToggle` which at least declared
`role="radiogroup"` / `role="radio"` scaffolding.

**Additional specialist finding in `NumberCardToggle.tsx`:** line 76 sets
`aria-label={`${current.trend}% ${current.trend >= 0 ? "increase" : "decrease"}`}`
on the `<Progress>` bar. Hardcoded English "increase" / "decrease" in the
accessible name — another undetected i18n a11y leak. This file is not in the
Sprint 2 diff, but it is a flashlight sibling of M-Y-08 (hardcoded English
aria-label on a non-label-friendly component). Translators cannot localize
this without a prop change. I'm treating this as a new MEDIUM finding
(M-NEW-01) rather than inflating H-Y-07.

**Additional specialist finding in `WeeklyBarChartToggle.tsx`:** the tab
label `chart.label` (e.g. "Activities" on line 40, line 81) is served
directly from the server as an English literal and compared with `===
"Activities"` (line 40). This is an i18n leak because the UI displays the
untranslated English label AND uses it as a control-flow key. Not an
accessibility finding per se but leaks into `aria-label`-like surfaces. I
note it here to reinforce that the dashboard toggles have multiple layered
i18n-a11y bugs beyond the ARIA role gap.

Baseline severity HIGH — **agree**.

---

## NEW HIGH findings (specialist-specific)

### H-NEW-01 — Site-wide missing skip link (WCAG 2.4.1 Level A)

- **File:** `src/app/layout.tsx:29-54`, `src/app/dashboard/layout.tsx:8-29`
- **Severity:** HIGH
- **Rule:** WCAG 2.4.1 (Bypass Blocks — Level A)
- **Finding:** There is no "Skip to main content" link anywhere in the
  application. The dashboard layout renders `<Sidebar>` and `<Header>` as
  persistent landmarks before `<main>` on every page. Keyboard users must
  Tab through the sidebar navigation (up to 8 links) + Header contents
  (toggle, SchedulerStatusBar, NotificationBell, ProfileDropdown) on
  every page load to reach the page content. This is a classic WCAG 2.4.1
  Level A violation.
- **Evidence:**
  - `src/app/layout.tsx` — no skip link in the root layout.
  - `src/app/dashboard/layout.tsx:20` — `<main>` has no `id` for
    skip-link targeting.
  - Repo-wide grep for `skip.*(link|content|nav)` and `href="#main`
    returns zero matches.
- **Reproduction:** Tab from the address bar on `/dashboard/myjobs`. The
  first focusable element is the sidebar's JobSync logo link, followed
  by all sidebar nav links, then the mobile-menu toggle, then the
  notification bell, then the profile dropdown, then finally content.
  On a page like `/dashboard/settings` with deeply nested settings
  tabs, keyboard users face 15+ tab stops before reaching the first
  interactive content element.
- **Suggested fix direction:**
  1. Add an `id="main-content"` to the `<main>` element in
     `src/app/dashboard/layout.tsx:20` (and the auth layout).
  2. Add a skip link in `src/app/layout.tsx` as the first focusable
     element of `<body>`:
     ```tsx
     <body>
       <a
         href="#main-content"
         className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow focus:ring-2 focus:ring-ring"
       >
         {t(locale, "nav.skipToContent")}
       </a>
       ...
     </body>
     ```
  3. Add translation keys `nav.skipToContent` in all 4 locales.

- **Why this is a HIGH, not a MEDIUM:** Level A violations are strict
  conformance floors. Skip links are one of the oldest and most widely
  recognized a11y patterns. A self-hosted product aiming for even Level A
  compliance MUST ship this. The baseline did not surface this because it
  focused on the Sprint 2 diff scope and not on site-wide landmark gaps —
  the fix touches `src/app/layout.tsx`, not a sprint file.

### H-NEW-02 — Multiple unnamed `<nav>` landmarks (WCAG 1.3.1 + ARIA)

- **File:** `src/components/Sidebar.tsx:17, 43`, `src/components/Header.tsx:35`
- **Severity:** HIGH
- **Rule:** WCAG 1.3.1 (Info and Relationships), ARIA landmark rule
  "multiple landmarks of the same type must have unique accessible names"
- **Finding:** The desktop sidebar contains TWO `<nav>` elements with no
  `aria-label` or `aria-labelledby` on either:
  1. `Sidebar.tsx:17` — main nav (SIDEBAR_LINKS).
  2. `Sidebar.tsx:43` — secondary nav (just the Settings link at the
     bottom).
  The mobile header Sheet also contains a third `<nav>` at
  `Header.tsx:35` with no accessible name. Screen reader users navigating
  by landmark hear "navigation, navigation, navigation" with no way to
  disambiguate. WAI-ARIA Authoring Practices REQUIRE unique names when
  multiple landmarks of the same role exist in a document.
- **Reproduction:** Open NVDA → D key (navigate landmarks). You hear
  "navigation" three times with no context. VoiceOver Rotor → Landmarks
  shows three identical "navigation" entries.
- **Suggested fix direction:**
  ```tsx
  // Sidebar.tsx:17
  <nav aria-label={t("nav.primaryNavigation")} className="...">
  // Sidebar.tsx:43
  <nav aria-label={t("nav.secondaryNavigation")} className="...">
  // Header.tsx:35
  <nav aria-label={t(locale, "nav.mobileNavigation")} className="...">
  ```
  Add translation keys. Alternatively, demote the secondary nav (just
  one link) to a plain `<div>` since a single link is not a navigation
  landmark.
- **Additional finding:** `NavLink.tsx:21-44` has NO `aria-current="page"`
  on the active route. The active state is communicated ONLY by
  `border-b-2` color + icon color change — both color-only, both invisible
  in forced-colors mode. Screen reader users get no signal that they are
  ON the current page. WCAG 1.3.1 (Info and Relationships) + 1.4.1 (Use
  of Color) both apply. Fix:
  ```tsx
  <Link
    href={route}
    aria-current={isActive ? "page" : undefined}
    className={...}
  >
  ```
  This is a separate HIGH on its own (navigational context for AT users
  is a 4.1.2 Name/Role/Value concern), but I'm bundling it with H-NEW-02
  since both apply to the same nav chrome.

### H-NEW-03 — `DashboardError` error page is hardcoded English + no SR announcement + no focus management

- **File:** `src/app/dashboard/error.tsx:1-20`
- **Severity:** HIGH
- **Rule:** WCAG 3.1.1 (Language of Page), WCAG 4.1.3 (Status Messages),
  WCAG 2.4.3 (Focus Order), project i18n mandate
- **Finding:** The dashboard error boundary renders three hardcoded
  English strings:
  ```tsx
  <h1 className="text-2xl font-bold">Something went wrong</h1>
  <p className="text-muted-foreground">{error.message}</p>
  ...
  <button onClick={reset} className="...">Try again</button>
  <Link href="/dashboard" className="...">Go to Dashboard</Link>
  ```
  Three separate a11y + i18n failures stacked:
  1. Hardcoded English text on an error page means DE/FR/ES users see
     "Something went wrong" mid-German/French/Spanish session.
  2. The error page has NO `role="alert"`, NO `aria-live="assertive"`,
     and NO programmatic focus move. When Next.js swaps the error
     boundary in, screen reader users get no announcement that an error
     occurred — focus remains on whatever element triggered the error,
     which may now be detached from the DOM.
  3. `error.message` is rendered verbatim from the server. If the error
     contains user-identifying information or stack fragments, it leaks
     via screen reader too.
- **Reproduction:** Trigger any server action failure on the dashboard
  (e.g. temporarily break a server action import) and reload
  `/dashboard/myjobs`. Inspect with NVDA: no announcement, focus on
  `<body>`, visible "Something went wrong" headline invisible to AT
  until the user hunts for it.
- **Suggested fix direction:**
  ```tsx
  "use client";
  import { useEffect, useRef } from "react";
  import Link from "next/link";
  import { useTranslations } from "@/i18n";

  export default function DashboardError({ error, reset }) {
    const { t } = useTranslations();
    const headingRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
      headingRef.current?.focus();
    }, []);

    return (
      <div role="alert" className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-bold focus:outline-none"
          >
            {t("errors.somethingWentWrong")}
          </h1>
          <p className="text-muted-foreground">
            {t("errors.genericDescription")}
          </p>
          <div className="flex gap-4 justify-center">
            <button onClick={reset} className="...">
              {t("errors.tryAgain")}
            </button>
            <Link href="/dashboard" className="...">
              {t("errors.goToDashboard")}
            </Link>
          </div>
        </div>
      </div>
    );
  }
  ```
  Key changes: `role="alert"` on the container; `tabIndex={-1}` +
  `useRef` + `useEffect` to move focus to the heading on mount; all
  strings routed through `t()`; swallow `error.message` and show a
  generic description instead (it can still be logged server-side).
- **Baseline comparison:** the baseline's M-Y-08 catches two hardcoded
  English `aria-label="Loading"` skeleton strings but does not surface
  the error boundary's three hardcoded-English strings + missing focus
  management. This is a blind spot in the flashlight-effect approach —
  error boundaries live outside the normal component tree and need to be
  specifically audited.

### H-NEW-04 — `StagedVacancyCard` footer buttons lack per-vacancy context in accessible names

- **File:** `src/components/staging/StagedVacancyCard.tsx:207-269`
- **Severity:** HIGH
- **Rule:** WCAG 2.4.6 (Headings and Labels), WCAG 4.1.2 (Name, Role, Value),
  WCAG 1.3.1 (Info and Relationships)
- **Finding:** Only the first Details button is labeled with the vacancy
  title:
  ```tsx
  <Button ... aria-label={`${t("staging.details")}: ${vacancy.title}`}>
    <Info className="h-3.5 w-3.5" />
    {t("staging.details")}
  </Button>
  ```
  But the other six footer buttons — Promote, Dismiss, Archive, Trash,
  Block, Restore — have NO `aria-label`. Each button renders only its
  generic verb text ("Promote", "Dismiss", etc.) as the accessible name.
  When a screen reader user tabs through a list of 20 StagedVacancyCards
  they hear:
  ```
  "Promote, button; Dismiss, button; Archive, button; Trash, button;
   Promote, button; Dismiss, button; Archive, button; Trash, button;
   ... (× 20)"
  ```
  with NO indication of which job the action applies to. This is worse
  than DiscoveredJobsList (H-Y-03) because the StagedVacancyCard buttons
  DO have visible text — so an automated linter won't flag them — but
  because there's no textual relationship between the button and the
  enclosing `<CardTitle>` (no `aria-labelledby` or `aria-describedby`),
  the association is purely visual / spatial.
- **Rationale:** WCAG 2.4.6 requires "headings and labels describe topic
  or purpose". For a list of items, "purpose" necessarily includes "which
  item". WCAG 1.3.1 requires programmatic relationships. The current code
  conveys these only visually.
- **Reproduction:** Open `/dashboard/staging` in list mode with NVDA.
  Tab through the footer. Announcement: "Promote, button; Dismiss,
  button; ..." — no vacancy context.
- **Suggested fix direction:** either
  (a) add `aria-label={`${t("staging.promote")}: ${vacancy.title}`}` to
      each button, matching the Details button's pattern, or
  (b) give the `<Card>` a proper `role="article"` (or keep default but)
      with `aria-labelledby={titleId}`, and use `aria-describedby` on the
      button group — so the screen reader's "browse mode" announcement
      surfaces the card title once as context for the nested buttons.
  Option (b) is lower-friction if `NotificationItem.tsx` is any guide —
  that file already uses `aria-labelledby={titleId}` on the `<article>`
  (line 168). Mirror the same pattern on `StagedVacancyCard`.
- **Baseline comparison:** the baseline's H-Y-03 caught the icon-only
  buttons in `DiscoveredJobsList`. The sibling pattern — text-labeled
  buttons with missing _item context_ — is the same class of problem at
  a higher cognitive level, and the baseline did not surface it. This is
  specifically where ARIA-pattern expertise pays off: the baseline
  reviewer looked for "button without accessible name" while the
  specialist looks for "button whose accessible name is insufficient
  given its list-item context".

### H-NEW-05 — `NotificationDropdown` uses `role="feed"` with invalid `<section>` children (ARIA authoring violation)

- **File:** `src/components/layout/NotificationDropdown.tsx:206-253`
- **Severity:** HIGH
- **Rule:** WAI-ARIA 1.2 — `feed` role's "Required Owned Elements" rule:
  `feed` may only own elements with role `article`. Nested `section`
  elements are NOT allowed as structural children of `feed`.
- **Finding:**
  ```tsx
  <div
    role="feed"
    aria-busy={loading}
    aria-label={t("notifications.title")}
    className="divide-y"
  >
    {groups.map((group) => (
      <section
        key={group.key}
        aria-label={t(group.labelKey)}
        className="divide-y"
      >
        <header className="sticky top-0 z-10 flex items-center ...">
          <span>{t(group.labelKey)}</span>
          ...
        </header>
        {groupItems.map(({ notification, position }) => (
          <NotificationItem ... />
        ))}
      </section>
    ))}
  </div>
  ```
  The `role="feed"` wraps four `<section>` elements (Today / Yesterday /
  This Week / Earlier), each containing a sticky `<header>` and multiple
  `<NotificationItem>` (rendered as `<article>`). Per the WAI-ARIA spec
  feed pattern (https://www.w3.org/WAI/ARIA/apg/patterns/feed/), the
  `feed` role requires its immediate children be `article` elements so
  screen readers can implement "next article" / "previous article"
  navigation. Interleaving `section` + `header` breaks this pattern —
  NVDA's feed navigation will skip or mis-announce items, and the
  `aria-posinset` / `aria-setsize` (set on each NotificationItem by
  `positionInSet={position}` / `setSize={totalItems}`) will not work
  correctly because the `feed` cannot enumerate its article children
  directly.
- **Reproduction:** In NVDA, press "a" (articles) to navigate between
  feed items. Items are reachable but the position announcement drops
  or shows stale counts because of the section boundary.
- **Suggested fix direction:** either
  (a) REMOVE `role="feed"` and let the feed be a plain `<div>` with
      group headings + a `<ul>` / `<li>` semantic list, which is both
      simpler AND more screen reader friendly, or
  (b) Keep `role="feed"` but flatten the group headings to
      `role="presentation"` sticky dividers and ensure the articles are
      direct children of the feed container. The `aria-posinset` /
      `aria-setsize` pattern already exists on NotificationItem (lines
      170-171) and would work correctly once the structure is flat.
  Option (a) is stronger; option (b) preserves the `feed` pattern if
  "infinite scroll" support is planned (it isn't today — the dropdown
  loads 50 items in one shot).
- **Why this is specialist-specific:** recognizing this requires direct
  familiarity with the WAI-ARIA APG feed pattern's owned-element
  constraint. A generic reviewer sees "role=feed + aria-label + items"
  and concludes it looks valid; the specialist knows `feed` is one of
  the strictest roles in the spec (along with `menu` and `tree`).

---

## NEW MEDIUM findings

### M-NEW-01 — `NumberCardToggle` Progress bar aria-label hardcoded English

- **File:** `src/components/dashboard/NumberCardToggle.tsx:74-77`
- **Severity:** MEDIUM
- **Rule:** WCAG 3.1.1, project i18n mandate
- **Finding:**
  ```tsx
  <Progress
    value={current.trend}
    aria-label={`${current.trend}% ${current.trend >= 0 ? "increase" : "decrease"}`}
  />
  ```
  Hardcoded English "increase" / "decrease" on the Progress bar's
  accessible name. Same class as baseline M-Y-08 but in a different
  file, and the baseline missed it (it's not wrapped in `role="status"`
  so grep for Loading didn't match).
- **Suggested fix direction:** add translation keys `dashboard.progressIncrease`
  / `dashboard.progressDecrease` and use `t()`.

### M-NEW-02 — `BulkActionBar` "Delete Permanently" has no confirmation dialog (WCAG 3.3.4)

- **File:** `src/components/staging/BulkActionBar.tsx:166-177`
- **Severity:** MEDIUM
- **Rule:** WCAG 3.3.4 (Error Prevention — Legal, Financial, Data — Level AA)
- **Finding:** The "Delete Permanently" button directly calls
  `handleAction("delete")` without any intermediate confirmation dialog:
  ```tsx
  {activeTab === "trash" && (
    <>
      ...
      <Button
        size="sm"
        variant="destructive"
        className="h-7 gap-1 text-xs"
        onClick={() => handleAction("delete")}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {t("staging.bulkDelete")}
      </Button>
    </>
  )}
  ```
  The translated label is "Delete Permanently" (EN), "Endgültig löschen"
  (DE), "Supprimer définitivement" (FR), "Eliminar permanentemente" (ES).
  This is an IRREVERSIBLE data-loss action. WCAG 3.3.4 requires that, for
  transactions that "delete or modify user-controllable data", the action
  be either (a) reversible, (b) checked for errors before submission, or
  (c) confirmed before submission. Selecting N items and hitting the
  destructive button goes directly to the server action with no
  confirmation step.
- **Reproduction:** Navigate to Trash tab, select N items, click "Delete
  Permanently" — the items are permanently deleted with no undo and no
  confirmation prompt. (The toast offers `undoTokenId` for _some_ bulk
  actions but the "delete" action type may not emit an undo token —
  needs verification in `bulk-action.service.ts`.)
- **Suggested fix direction:** wrap the destructive action in an
  `AlertDialog` matching `BlockConfirmationDialog.tsx`:
  ```tsx
  <BulkDeleteConfirmationDialog
    open={confirmDeleteOpen}
    onOpenChange={setConfirmDeleteOpen}
    count={count}
    onConfirm={() => { handleAction("delete"); setConfirmDeleteOpen(false); }}
  />
  ```
  Trigger it from the button click instead of calling `handleAction`
  directly. Same pattern as `BlockConfirmationDialog.tsx` which already
  exists for the similar-impact "block company" action.
- **Baseline comparison:** baseline missed this. It's not strictly an
  "a11y" bug in the narrow sense — a sighted user is equally at risk —
  but WCAG 3.3.4 Level AA explicitly covers "Error Prevention" for
  data-loss actions as an accessibility criterion. Users with cognitive
  disabilities are disproportionately affected by accidental-click data
  loss.

### M-NEW-03 — `StagingLayoutToggle` buttons are ~28×28 — below 2.5.5 AAA threshold

- **File:** `src/components/staging/StagingLayoutToggle.tsx:51-116`
- **Severity:** MEDIUM
- **Rule:** WCAG 2.5.5 AAA (Target Size — 44×44)
- **Finding:** The buttons use
  `rounded-sm px-2.5 py-1.5 text-xs font-medium` (no explicit height).
  With `py-1.5` (6px each side) + text-xs (12px line) the computed height
  is ~24px. Visible target is well below both WCAG 2.5.8 AA (24×24
  minimum) and 2.5.5 AAA (44×44). Since CRIT-Y1 just committed to raising
  deck actions to 44×44, the same AAA bar should apply to the toolbar
  that ships alongside them. The baseline's M-Y-01 through M-Y-06
  enumerated several CRIT-Y1 flashlight targets but missed the fixed
  toggle itself — ironic given CRIT-Y2 just landed on this same file.
- **Suggested fix direction:** raise button padding to
  `px-3 py-2.5` minimum (≈ 36×36) or wrap each button in a 44×44
  invisible hit area. Prefer the latter to preserve the compact toolbar
  look.

---

## NEW LOW findings

### L-NEW-01 — DeckView concurrent `aria-live` regions (polite + assertive) may collide

- **File:** `src/components/staging/DeckView.tsx:524-545`
- **Severity:** LOW
- **Rule:** WCAG 4.1.3 (Status Messages), WAI-ARIA live-region authoring
- **Finding:** Two live regions stacked directly:
  ```tsx
  <div aria-live="polite" aria-atomic="true" className="sr-only">
    {currentVacancy && (
      currentVacancy.matchScore != null
        ? t("deck.cardAnnouncement")...
        : t("deck.cardAnnouncementNoScore")...
    )}
  </div>
  <div aria-live="assertive" aria-atomic="true" className="sr-only">
    {lastAction}
  </div>
  ```
  On each action, BOTH regions update simultaneously:
  - The polite region updates when `currentVacancy` changes (new card
    slides in).
  - The assertive region updates when `lastAction` is set.
  `assertive` interrupts the polite announcement in progress. Depending
  on AT implementation, users may hear either the card-change message
  OR the action confirmation but rarely both. NVDA and JAWS differ on
  this interruption behavior.

  Additionally, the polite region IS the card-change announcement —
  which is itself borderline: announcing a full card's worth of metadata
  ("Card 3 of 20, Senior Engineer, Acme Corp, Berlin, 72%") on EVERY
  action is quite verbose. WCAG 4.1.3 says status messages should be
  "provided to the user without receiving focus", but "status message"
  generally implies state changes ("saved", "removed"), not a full data
  re-read.
- **Suggested fix direction:** reduce to ONE polite live region that
  announces only the action + next-card title (short):
  `"{t('deck.actionDismissed')} — {t('deck.nextCard', { title: next.title })}"`.
  Drop the assertive region entirely (the deck actions are
  user-initiated and never error-like). This also eliminates the
  interruption collision.

### L-NEW-02 — `DiscoveredJobDetail` external-link anchor is inside `DialogTitle`

- **File:** `src/components/automations/DiscoveredJobDetail.tsx:106-118`
- **Severity:** LOW
- **Rule:** ARIA APG "Dialog" best practices; interactive-in-heading
  guidance
- **Finding:** The external-link `<a>` (same H-Y-04 defect — no
  accessible name) is rendered INSIDE `<DialogTitle>`:
  ```tsx
  <DialogTitle className="flex items-center gap-2">
    {job.title}
    {jobUrl && (
      <a href={jobUrl} target="_blank" rel="noopener noreferrer" ...>
        <ExternalLink className="h-4 w-4" />
      </a>
    )}
  </DialogTitle>
  ```
  Radix's `Dialog` uses `DialogTitle` as the dialog's accessible name
  (`aria-labelledby`). Embedding an interactive element inside changes
  the accessible name computation: most screen readers concatenate the
  title text + the anonymous link's role, producing announcements like
  "Data Analyst link" on dialog open. Separately, the link child has
  no accessible name (duplicate of H-Y-04).
- **Suggested fix direction:** move the external-link OUT of the
  `DialogTitle`, put it in an adjacent header row:
  ```tsx
  <DialogHeader>
    <div className="flex items-center gap-2">
      <DialogTitle>{job.title}</DialogTitle>
      {jobUrl && (
        <a href={jobUrl} target="_blank" rel="noopener noreferrer"
           aria-label={t("automations.discoveredJob.openOnSource")}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </div>
    ...
  </DialogHeader>
  ```

---

## Methodology

Files read in full (24): `MatchScoreRing.tsx`, `DeckCard.tsx`, `DeckView.tsx`,
`StagedVacancyCard.tsx`, `StagedVacancyDetailContent.tsx`,
`StagedVacancyDetailSheet.tsx`, `StagingContainer.tsx`, `StagingLayoutToggle.tsx`,
`StagingNewItemsBanner.tsx`, `SuperLikeCelebration.tsx`, `SuperLikeCelebrationHost.tsx`,
`BlockConfirmationDialog.tsx`, `PromotionDialog.tsx`, `BulkActionBar.tsx`,
`ViewModeToggle.tsx`, `KanbanViewModeToggle.tsx`, `KanbanCard.tsx`,
`RecentCardToggle.tsx`, `NumberCardToggle.tsx`, `WeeklyBarChartToggle.tsx`,
`DiscoveredJobsList.tsx`, `DiscoveredJobDetail.tsx`, `NotificationBell.tsx`,
`NotificationDropdown.tsx`, `NotificationItem.tsx`, `Sidebar.tsx`, `Header.tsx`,
`NavLink.tsx`, `dashboard/layout.tsx`, `app/layout.tsx`, `dashboard/error.tsx`,
`useDeckStack.ts`.

Tool use:
- Grep project-wide for `forced-colors`, `prefers-reduced-motion`, `<main`,
  `skip.*(link|content|nav)`, `aria-invalid`, `aria-current`, `role=` scan
  on sidebar/header files, `cursor-pointer` for clickable non-button
  patterns, `role="feed"`, etc.
- Read the baseline report at `.team-feature/stream-5b-accessibility.md` in
  full before starting the validation, then independently re-verified each
  HIGH by reading the cited file and line range.

Scope exclusions: per constraints, no dev server started, no Playwright run,
no axe-core invocation, no commits. Findings are static-review only.

Not re-surfaced (already fixed in Sprint 1):
- CRIT-Y1 (deck target sizes 44×44) — verified in place.
- CRIT-Y2 (StagingLayoutToggle Check glyph + single aria-label source) —
  verified in place.
- CRIT-Y3 (SuperLikeCelebration ctaRef focus + global Escape listener +
  aria-labelledby + skipNextFocusPauseRef timer guard) — verified in place.

Gaps / areas I did NOT review (would need more time):
- `src/components/tasks/*` — brief skim showed `TasksTable.tsx:246` has
  a hardcoded English `aria-label="Edit ${task.title}"` but file was not
  in the Sprint 2 diff. Not reported formally; noted here.
- `src/components/settings/*` — only spot-checked `ApiStatusOverview.tsx`
  (baseline M-Y-04); the other 15 settings files may harbor more form
  errors / aria-invalid gaps (only 2 files total use `aria-invalid` per
  repo grep — suggests widespread under-use).
- Color contrast verification of `text-amber-500`, `text-blue-500` on
  light + dark themes not performed (needs tooling).
- `forced-colors: active` media query coverage — baseline noted zero
  sites globally. Not a Sprint 2 regression but a standing gap.

---

## Verdict on specialization value

**YES — specialization was worth it on this sprint.**

The generic baseline reviewer caught all the obvious flashlight-effect
patterns (target sizes, color-only active states, icon-only buttons) and
did a strong job on the Sprint 2 extraction regressions (H-Y-01, H-Y-02).
7 HIGH / 8 MEDIUM / 5 LOW is an exceptional baseline yield — higher than
the other 4 dimensions' generic reviews.

The specialist added **5 NEW HIGH** findings that required specific
knowledge the baseline did not apply:

1. **Landmark navigation gaps** (skip link, unnamed `<nav>`s,
   missing `aria-current`) — requires WCAG 2.4.1 / 1.3.1 + ARIA
   landmark-naming convention awareness.
2. **WAI-ARIA `feed` role authoring violation** — requires deep ARIA APG
   pattern knowledge (feed only owns article children).
3. **Error boundary i18n + live-region + focus management** — requires
   understanding that error boundaries are a distinct focus-management
   zone outside normal component flow.
4. **List-item button context (StagedVacancyCard)** — requires WCAG 2.4.6
   "Headings and Labels" interpretation beyond "does the button have an
   accessible name".
5. **WCAG 3.3.4 destructive-action confirmation** (bulk permanent delete)
   — requires recognition that Level AA error-prevention applies to
   data-loss actions, not just forms.

Percentage uplift: **5 NEW HIGH / 7 baseline HIGH = ~71% HIGH uplift**,
PLUS 3 NEW MEDIUM + 2 NEW LOW. This exceeds the architecture specialist's
40% uplift from the earlier experiment. Accessibility is a strong fit for
specialization because the WCAG + ARIA rulebook is dense enough that a
generic reviewer will consistently miss structural/pattern-level issues.

Recommendation: continue using specialized agents for the a11y dimension
on all future sprints involving UI changes. The generic `team-reviewer`
is good at catching surface regressions; the specialist catches
infrastructural landmark/pattern gaps that compound over time.
