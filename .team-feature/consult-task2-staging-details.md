# Consultation — Staging Vacancy Details View (Task 2)

**Consultant:** ui-design / interaction-design (via Claude)
**Date:** 2026-04-09
**Scope:** Add a "view full details before acting" affordance to the JobSync staging view (both List and Deck modes).
**Reference skill:** `/home/pascal/.claude/plugins/cache/claude-code-workflows/ui-design/1.0.3/skills/interaction-design/SKILL.md`
**Reference component:** `/home/pascal/projekte/jobsync/src/components/automations/DiscoveredJobDetail.tsx`

---

## TL;DR — Opinionated Recommendation

- Build **one shared presentational component** `StagedVacancyDetailContent` that renders the full field set, and **one shared container** `StagedVacancyDetailSheet` that wraps it in a responsive Sheet/Dialog.
- **Sheet from the right on desktop (`side="right"`, 520-640px)** and **bottom sheet on mobile (`side="bottom"`, ~92vh)**. Not the centered `Dialog` — the card stack is a vertical focal point and a center dialog covers everything; a side sheet keeps the queue visible and pins the action rail.
- **List mode:** clicking the card body opens details. Checkbox, action buttons, and the "block company" chip keep their own click zones via `stopPropagation`. Add an explicit "Details" button as a safety net and a keyboard affordance. Shortcut: `Enter` / `Space` when a card is focused.
- **Deck mode:** dedicated **Info button (`i` icon)** below the card, to the right of the Skip button. Keyboard: `i` or `Enter`. No long-press, no tap-on-card — both would collide with drag-to-swipe.
- The detail sheet **preserves deck position** — it never advances `currentIndex` on open/close. The deck container drag handler is disabled while the sheet is open.
- The sheet **contains the same action buttons** (dismiss, super-like, promote, block) that fire the existing `handleDeckAction` / list handlers. Closing the sheet without acting is neutral.
- Reuse Radix `Sheet` primitives (already available at `src/components/ui/sheet.tsx`) — they give focus trap, ESC, overlay, and `prefers-reduced-motion` compliance for free.
- **Do NOT extend** `DiscoveredJobDetail.tsx`. It is tightly coupled to `DiscoveredJob` / automation entities. Instead, **extract** its visual structure into the new shared component and leave `DiscoveredJobDetail` as a thin wrapper (phase 2 refactor — not required for this task, but noted).

---

## 1. How the user opens the details view

### List mode (`StagedVacancyCard.tsx`)

**Primary affordance:** click anywhere on the card's non-interactive surface.

- Wrap `<CardHeader>` + `<CardContent>` (but **not** `<CardFooter>`) in a `<button type="button">` that calls `onOpenDetails(vacancy)`. The footer buttons and the header checkbox already sit above that zone; add `onClick={(e) => e.stopPropagation()}` to the checkbox label so selection is not hijacked.
- Show a subtle hover treatment on the card (`hover:bg-muted/40 transition-colors duration-150`) to advertise the affordance. Do NOT add a raised shadow on hover — `StagedVacancyCard` already sits in a dense list and extra shadow creates jitter.
- Cursor: `cursor-pointer` on the clickable area.

**Explicit secondary affordance:** add a small "Details" ghost button with the `Info` icon from `lucide-react` as the leftmost item in the footer button row. This is critical for:
- Screen reader users who should not rely on a clickable card region (the button has an obvious role)
- Users on touch devices where accidental swipe/drag can feel like a tap
- Power users who scan for explicit verbs

Label: `t("staging.details")` → "Details" / "Details" / "Détails" / "Detalles".

**Keyboard:** the outer card wrapper receives `tabIndex={0}` and `role="button"`, with `onKeyDown` handling `Enter` and `Space` (prevent default on Space, trigger on keyup as per WAI-ARIA button pattern). Because the card contains nested buttons, use the explicit "Details" footer button as the primary keyboard target instead; keep the card wrapper non-focusable to avoid a nested-interactive a11y violation. **Recommendation:** do NOT make the card itself a button — that violates the "no interactive element inside an interactive element" rule (checkbox + footer buttons are children). Instead, use a plain `<div onClick>` with `role="presentation"` for mouse affordance, and require the explicit Details button for keyboard/SR access.

**Do not use an accordion.** Inline expansion pushes every card below the expanded one out of view and wrecks the triage rhythm.

### Deck mode (`DeckView.tsx` + `DeckCard.tsx`)

**Primary affordance:** a **dedicated Info button** in the action rail between Skip and the negative/positive action groups. Icon: `Info` from `lucide-react`, size 40px (matches Skip), muted color (`bg-muted text-muted-foreground`).

- Placement: insert between the existing Skip button and the Undo button (so it sits visually with the "neutral" group).
- Label: `aria-label={t("deck.detailsTooltip")}` and matching `title`.

**Shortcut:** add `i` to the keyboard dispatch table in `useDeckStack.ts` (case `"i"` → `openDetails()`). Also accept `Enter` when the deck container has focus AND no drag is in progress. Do NOT map `Space` — it would conflict with page-scroll fallback on mobile browsers.

**Why NOT tap-on-card:** the card is already a drag target for swipe. A tap registers before the drag threshold is reached, which would (a) compete with short accidental swipes, (b) force a "tap vs drag" debounce heuristic that users cannot see or understand, and (c) break when the user tries to rotate the card slightly to preview. In the existing code `touchAction: "none"` + pointer capture already make the card unsuitable as a tap target.

**Why NOT long-press:** long-press on mobile conflicts with the browser's native text-selection / context-menu handler, and the `touchAction: "none"` on the draggable card suppresses long-press reliably on some Android builds but not others. It is also completely undiscoverable.

**Why NOT edge swipe:** five swipe directions (up / down / left / right / edge) exceed the user's mental model. The current 4-direction swipe is already the ceiling.

**Optional polish (phase 2):** add a small `Info` icon button in the **top-right corner of the card itself** (next to the Match Score ring) — icon only, 28px, `stopPropagation` on pointerdown so it never starts a drag. This gives users an affordance exactly where their thumb already hovers. But only add this if usability testing of the action-rail button shows discoverability is weak. For v1, stick with the action-rail button.

---

## 2. How details are shown — Sheet, not Dialog

Use the existing Radix `Sheet` primitive at `src/components/ui/sheet.tsx`. Create a new component that switches `side` based on viewport.

### Why Sheet, not Dialog?

- **Deck mode preservation of place:** a centered `Dialog` completely obscures the card stack. The user loses spatial context ("where was I in the queue?"). A right-side sheet on desktop leaves the stack visible behind a dim overlay and the deck counter ("7 / 42") remains in peripheral vision. Closing the sheet returns the user precisely to where they were.
- **Mobile ergonomics:** on phones the action rail sits at the bottom of the screen. A bottom sheet (dragged up or tapped into view) keeps the thumb in the action zone. A dialog forces the thumb to travel to the top-right X.
- **Reading ergonomics:** job descriptions are long. A tall, narrow sheet (520-640px) reads like a document. A centered dialog capped at `max-w-2xl max-h-[90vh]` (as in `DiscoveredJobDetail`) creates a cramped square.
- **Accessibility:** Radix `Sheet` is built on `Dialog`, so it inherits focus trap, ESC, portal mounting, overlay click-to-close, and `aria-modal`.

### Responsive sizing

| Breakpoint | Side | Width/Height | Rationale |
|---|---|---|---|
| `< sm` (< 640px) | `bottom` | `h-[92vh]` with top-rounded corners, drag handle | Thumb zone, matches OS bottom-sheet idiom |
| `sm` to `lg` | `right` | `w-full sm:max-w-xl` (~576px) | Keeps list visible beside it |
| `lg +` | `right` | `w-[640px] max-w-[45vw]` | Comfortable reading column |

Override `sheetVariants` locally or extend them (preferred — add a `detail` variant to `sheet.tsx`). Keep the existing `side="bottom"` / `side="right"` and pass custom `className` for width.

### Content structure (inside the sheet)

Model after `DiscoveredJobDetail` but richer:

```
SheetHeader
  Title row: vacancy.title + external source link (ExternalLink icon)
  Subtitle row: CompanyLogo + employer + MapPin + location + Calendar + date
  Badge row: match score ring (reuse MatchScoreRing from DeckCard) + source board badge + automation name

ScrollArea (flex-1 min-h-0)
  Section: Key facts — grid of 2 columns on sm+
    - Contract type (positionOfferingCode → translated)
    - Salary range (formatSalaryRange)
    - Required education
    - Required experience years
    - Working languages (chips)
    - Immediate start badge
    - Number of posts
    - Contract start/end dates
    - EURES flag
  Section: Description (whitespace-pre-wrap, no clamp)
  Section: Application instructions (if present)
  Section: Company — description + companyUrl (deep-link button)
  Section: Classifications — industryCodes + occupationUris (both as chip lists; chips are inert in v1, clickable in phase 2 to filter)
  Section: Metadata — sourceBoard, externalId, discoveredAt, sourceUrl

SheetFooter (sticky, border-top, bg-background)
  Contextual action bar — same action buttons as the current mode, see §4
```

**Scroll:** use `ScrollArea` from `src/components/ui/scroll-area.tsx` (already used by `DiscoveredJobDetail`) so the footer stays pinned. On mobile bottom sheet, wrap the ScrollArea in a flex column so only the description area scrolls and the footer action rail never disappears.

---

## 3. How the user returns without losing their place

### Deck mode — critical constraint

- **Opening the sheet MUST NOT advance `currentIndex`.** The sheet is read-only with respect to queue state.
- While the sheet is open, disable swipe drag on the underlying card. Implementation: add `isDetailsOpen` state to `DeckView`; gate `handlePointerDown` with `if (isDetailsOpen) return;`. Also pass a `disabled` prop to the hidden drag handlers.
- Closing with ESC, overlay click, or X button returns to the exact same card with zero state change.
- The undo stack (`useDeckStack`) is untouched because no action fired.
- Counter ("7 / 42") stays visible behind the overlay as implicit "you are still here" feedback.

### List mode

- Sheet closes; scroll position of the list is preserved because the list never re-rendered (the sheet is a sibling, not a replacement).
- If the user promoted/dismissed/archived from inside the sheet, the list reloads via `reload()` (same as the existing footer buttons).

### "Next / Previous" navigation inside the sheet (optional polish)

- In deck mode, show `←` / `→` chevron buttons at the top of the sheet to navigate the sheet's content through the queue WITHOUT acting. This is how Tinder and LinkedIn handle detail views. It lets the user preview multiple cards in detail mode, then close the sheet to resume swiping.
- Implementation: the sheet receives `vacancies[]`, `currentIndex`, and `onNavigate(delta)`. Navigation is **local to the sheet** — it does not mutate `useDeckStack`'s `currentIndex`. Only committed actions (promote/dismiss/etc.) advance the deck.
- Shortcut: `[` and `]` while the sheet is open.
- **Recommendation for v1:** ship WITHOUT this. Add in a v1.1 iteration. The simpler "one card, one sheet, close to return" model is testable first.

---

## 4. Acting on the vacancy from within the details view

**Yes — actions MUST be available inside the sheet.** Without them the user has to close, relocate the card, and click the footer button, which defeats the purpose of reducing triage friction.

### Action set per mode

**List mode sheet footer (sticky):**
- Promote (primary, filled emerald)
- Dismiss (outline)
- Archive (ghost)
- Block company (ghost, destructive text)

These mirror `StagedVacancyCard`'s footer exactly and call the same handlers passed from `StagingContainer`.

**Deck mode sheet footer (sticky):**
- Promote (primary)
- Super-like (secondary)
- Dismiss (outline)
- Block (ghost destructive)
- Skip (ghost)

These call the existing `handleDeckAction(vacancy, action)` from `StagingContainer`, so all bookkeeping (stats, undo stack, rollback on failure) works unchanged.

### Flow after an action

- Fire the action (optimistic UX, loading state on the pressed button — reuse the `Loader2` + disabled pattern from `DiscoveredJobDetail`).
- On success: close the sheet (`onOpenChange(false)`), then the underlying deck / list advances naturally because the handler already calls `reload()` or `performAction`.
- On failure: keep the sheet open, surface the existing toast, leave the card in place.
- **Important:** in deck mode, calling `promote` / `dismiss` from inside the sheet must go through `performAction` in `useDeckStack` so that the exit animation, undo stack, and stats all update. Expose a single entry point from `useDeckStack` to the sheet (e.g., pass `dismiss`, `promote`, `superLike`, `block`, `skip` as props to the sheet — the same functions that the action rail calls).

### Prevent double-action

- Track `loadingAction` state inside the sheet (like `DiscoveredJobDetail` does with `"accept" | "dismiss" | null`).
- Disable all action buttons while one is in flight.
- Disable keyboard shortcuts inside the sheet while any action is pending.

### Do NOT put keyboard swipe shortcuts inside the sheet

The deck-wide shortcuts (`d`, `p`, `s`, `b`, `n`, `z`) registered in `useDeckStack` should **not** fire while the sheet is open. Gate the `useEffect` keydown handler with `if (isDetailsOpen) return;`. Otherwise the user presses `p` to scroll through a description field and promotes the card by accident. Inside the sheet, only the action buttons' own keyboard activation (Enter / Space on focused buttons) should be live.

---

## 5. Accessibility requirements

All are first-class, not "nice to have".

### Focus management
- **Focus trap:** inherited from Radix `Dialog` (the base of `Sheet`). Verify by opening sheet, pressing Tab repeatedly, and confirming focus cycles within the sheet.
- **Initial focus:** set to the sheet's close button (default Radix behavior) OR to the first interactive element in the content. Recommendation: **keep default close-button focus** — it makes ESC behavior obvious and avoids surprising users who expected the first action button.
- **Focus restoration:** on close, Radix automatically restores focus to the element that opened the sheet. This is critical:
  - In list mode, focus returns to the "Details" button on the card the user was viewing → the list position is preserved.
  - In deck mode, focus returns to the Info button in the action rail → the deck is still at the same card.
- **No focus traps inside scroll:** avoid `tabIndex={-1}` on the ScrollArea content; internal links / buttons must be keyboard reachable.

### Keyboard
- `Escape` closes the sheet (Radix default).
- `Tab` / `Shift+Tab` cycle focus.
- Action buttons respond to `Enter` and `Space` (native `<button>` behavior).
- Document the sheet-specific shortcuts in the existing `deck.keyboardShortcuts` hint area: add `I = details`, `Esc = close`.
- Gate the deck-wide shortcut handler in `useDeckStack` on `isDetailsOpen` so nothing fires through the overlay.

### ARIA & screen readers
- `SheetContent` automatically carries `role="dialog"` and `aria-modal="true"`.
- `SheetTitle` is required for `aria-labelledby`. Do NOT omit it — Radix will warn in dev. If a visual title is not desired on mobile, use `VisuallyHidden` from Radix (`@radix-ui/react-visually-hidden`), but the vacancy title is always shown, so this is moot.
- `SheetDescription` → short subtitle ("Company · Location · Date").
- Live region announcement on open: add an `aria-live="polite"` region inside the sheet that fires once: "Showing details for {title} at {employer}". Reuse the existing pattern from `DeckView` (`aria-live="polite" sr-only`).
- Action buttons already have `aria-label` in the current code — keep them.
- Badge row (match score, source, automation) should be wrapped in `<ul role="list">` with each item as `<li>` for SR enumeration. Currently they are plain divs.
- When an action fires and the sheet closes, re-use the existing `aria-live="assertive"` `lastAction` region in `DeckView`. No new announcement system needed.

### Visible focus indicators
- All interactive elements already use `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` in the codebase — maintain the convention for all new buttons.
- On the card surface (list mode) the clickable zone must show a focus ring even though it is a `<div>`. Better: **don't make the card itself a button** (see §1), require the explicit Details button for keyboard.

### Color contrast
- Ensure the sticky footer has a solid `bg-background` (not translucent) so the ScrollArea content doesn't bleed through and reduce contrast.
- Match score ring already handles dark mode; reuse verbatim.

---

## 6. Animation & reduced motion

### Default animation
- Radix `Sheet` slides in from the side (300-500ms per `sheet.tsx` variants). This is already tuned.
- The overlay fades in.
- Match the timing scale from the interaction-design skill: 300-500ms for modal-class transitions. The existing variants use `data-[state=open]:duration-500` for open and `data-[state=closed]:duration-300` for close. Keep as-is.
- Easing: the existing Tailwind `animate-in` / `animate-out` utilities use the default Tailwind easing which is fine. Do not override.

### Reduced motion
- Add `motion-reduce:!transition-none motion-reduce:!animate-none` to `SheetContent` and `SheetOverlay`. Users with `prefers-reduced-motion: reduce` get an instant open/close.
- The existing `DeckCard` and `DeckView` already use this pattern (`motion-reduce:!animate-none motion-reduce:!transition-none`). Stay consistent.
- Verify that the deck's exit animation is **not** triggered when opening the sheet — only action buttons trigger `exitDirection`. Opening the sheet is a pure overlay event.

### Inside the sheet
- No framer-motion needed. All transitions are CSS-driven via Tailwind / Radix.
- Badge row, metadata chips: no entrance animation. Over-animating detail views creates fatigue on repeat use (triaging 50 cards means seeing this sheet 50 times).
- Button press feedback: rely on the existing `active:scale-90` treatment used across the codebase.

### Scroll behavior
- `ScrollArea` from Radix / shadcn handles smooth scrolling. No snap points (they fight with touch drag inside the sheet on mobile).

---

## 7. Component extraction plan — exact file names

### New files

1. **`src/components/staging/StagedVacancyDetailContent.tsx`**
   - Pure presentational component
   - Props: `{ vacancy: StagedVacancyWithAutomation }`
   - Renders the full field set: header, badge row, description, company, classifications, metadata sections
   - No sheet/dialog wrapper — just the content
   - No action buttons — those live in the container
   - Internally uses `CompanyLogo`, `MatchScoreRing` (extracted — see below), `ScrollArea`, `Badge`, `ChipList`
   - Fully i18n via `useTranslations`

2. **`src/components/staging/StagedVacancyDetailSheet.tsx`**
   - Container that owns the Sheet open/close state via props
   - Props:
     ```ts
     interface StagedVacancyDetailSheetProps {
       vacancy: StagedVacancyWithAutomation | null;
       open: boolean;
       onOpenChange: (open: boolean) => void;
       mode: "list" | "deck";
       // List mode handlers
       onPromote?: (vacancy: StagedVacancyWithAutomation) => void;
       onDismiss?: (id: string) => void;
       onArchive?: (id: string) => void;
       onBlockCompany?: (name: string) => void;
       // Deck mode handlers
       onDeckAction?: (action: DeckAction) => void;
     }
     ```
   - Uses `Sheet`, `SheetContent` with `side="right"` on `sm+` and `side="bottom"` on mobile (via a `useMediaQuery` hook OR Tailwind-only `className` tricks — see note below)
   - Renders `StagedVacancyDetailContent` inside the scroll area
   - Renders a sticky footer with mode-aware action buttons
   - Tracks `loadingAction` state to prevent double-submit
   - Handles keyboard event gating (stops propagation of deck shortcuts)
   - **Note on responsive Sheet side:** Radix Sheet's `side` prop is set at render time. Use a `useIsMobile()` hook (check for `src/hooks/use-media-query.ts` first — create if missing) and pass the side conditionally. Alternatively, create two `Sheet` instances and render whichever matches the breakpoint — but the hook approach is cleaner.

3. **`src/components/staging/MatchScoreRing.tsx`** — extracted from `DeckCard.tsx`
   - The existing `MatchScoreRing` inside `DeckCard.tsx` should become its own file so both `DeckCard` and `StagedVacancyDetailContent` can import it
   - Props: `{ score: number; size?: "sm" | "md" | "lg" }` (add size variants so the detail sheet can show a larger ring)
   - Keep the existing color thresholds and SR label

### Existing files to modify

1. **`src/components/staging/StagedVacancyCard.tsx`**
   - Add an `onOpenDetails: (vacancy: StagedVacancyWithAutomation) => void` prop
   - Add an `Info` button to the footer (leftmost)
   - Wrap the header + content (NOT the checkbox, NOT the footer) in a clickable `<div role="presentation" onClick={...} className="cursor-pointer hover:bg-muted/40 rounded-md -mx-2 -my-2 px-2 py-2 transition-colors duration-150">`
   - Use `stopPropagation` on the checkbox and footer to prevent bubbling

2. **`src/components/staging/DeckView.tsx`**
   - Add `const [detailsOpen, setDetailsOpen] = useState(false);`
   - Add an `Info` button to the action rail between Skip and Undo
   - Pass `disabled={detailsOpen}` through to the drag handlers (`handlePointerDown`, `handlePointerMove`, `handlePointerUp`) via an early return: `if (detailsOpen) return;`
   - Render `<StagedVacancyDetailSheet mode="deck" vacancy={currentVacancy} open={detailsOpen} ... onDeckAction={(a) => { setDetailsOpen(false); performAction from hook }} />`
   - Extend `useDeckStack` to accept an `isDetailsOpen` flag that gates its keyboard `useEffect`. Add `isDetailsOpen?: boolean` to `UseDeckStackOptions`. Early return inside the key handler if open.

3. **`src/components/staging/StagingContainer.tsx`**
   - Add `const [detailsVacancy, setDetailsVacancy] = useState<StagedVacancyWithAutomation | null>(null); const [detailsOpen, setDetailsOpen] = useState(false);`
   - Create `handleOpenDetails = (v) => { setDetailsVacancy(v); setDetailsOpen(true); }`
   - Pass `onOpenDetails={handleOpenDetails}` to `StagedVacancyCard`
   - Render one `<StagedVacancyDetailSheet mode="list" vacancy={detailsVacancy} open={detailsOpen} onOpenChange={setDetailsOpen} onPromote={handlePromote} onDismiss={handleDismiss} onArchive={handleArchive} onBlockCompany={handleBlockCompany} />` sibling to the existing `<PromotionDialog>`

4. **`src/components/staging/DeckCard.tsx`**
   - Remove the inline `MatchScoreRing` definition, `import { MatchScoreRing } from "./MatchScoreRing"` instead
   - (Optional) remove the description `expanded` state — the Details sheet now owns full description rendering. Keep the `line-clamp-4` and "Show more" button as-is for quick preview; or replace "Show more" with a "View details" CTA that opens the sheet. **Recommendation:** keep "Show more" for inline expansion AND add a separate Info button in the action rail. Two different mental models: inline expand = quick glance, Info = full detail with actions.

5. **`src/i18n/dictionaries/automations.ts`** (or `jobs.ts` / `staging.ts` — wherever `staging.*` and `deck.*` keys live)
   - Add keys in all 4 locales: `staging.details`, `staging.detailsTooltip`, `staging.closeDetails`, `deck.detailsTooltip`, `deck.detailsShortcut`, `deck.openingDetails` (live region), `staging.applicationInstructions`, `staging.classifications`, `staging.metadata`, `staging.industryCodes`, `staging.occupationUris`, `staging.workingLanguages`, `staging.requiredExperience`, `staging.contractPeriod`, `staging.companyDescription`, `staging.externalSource`
   - Validate with `bun run /tmp/test-dictionaries.ts`

6. **`src/hooks/use-media-query.ts`** (new, if not present)
   - Simple `useMediaQuery(query: string): boolean` hook with SSR-safe initial value (`false`)
   - Used by `StagedVacancyDetailSheet` to pick `side="bottom"` on `< 640px`

### What NOT to do

- **Do not extend `DiscoveredJobDetail.tsx`** to handle staged vacancies. Its props type is `DiscoveredJob`, which is a separate entity with fields that do not overlap 1:1 with `StagedVacancy` (e.g., no `positionOfferingCode`, `industryCodes`, `occupationUris`). Mixing the two leaks the automations context into staging.
- **Do not inline a `Dialog`** into `DeckView`. It couples the view to a specific presentation and makes the list-mode reuse impossible.
- **Do not add swipe-to-dismiss** on the sheet itself. Radix handles close-on-overlay-click and ESC; swipe-to-dismiss conflicts with the deck's swipe vocabulary ("swipe means act, not close").
- **Do not use a `Popover`** — popovers are anchored, small, and dismiss on outside click without an overlay. Unsuitable for long-form content.
- **Do not add a URL route** (`/staging/:id`) in v1. The sheet is ephemeral state. A URL route adds navigation history noise during triage sessions. Add in phase 2 if users request deep-linkable details.

---

## Testing checklist

- **Unit:** `StagedVacancyDetailContent.spec.tsx` — renders all field sections, handles missing fields gracefully (empty `description`, null `salaryMin/Max`, empty `industryCodes`)
- **Component:** `StagedVacancyDetailSheet.spec.tsx` — opens/closes via prop, fires action handlers, disables buttons while loading
- **Integration:** modify `StagingContainer.spec.tsx` to verify sheet opens from both list mode and deck mode
- **E2E:** `e2e/crud/staging-details.spec.ts` — open details in list mode, act from inside, verify list updates; open details in deck mode, verify deck position unchanged on close
- **A11y:** verify focus returns to trigger on close in both modes; verify ESC closes; verify screen reader announces the open event; verify `prefers-reduced-motion` disables slide animation
- **i18n:** verify all 4 locales have the new keys (`bun run /tmp/test-dictionaries.ts`)

---

## Summary of file changes

**New:**
- `/home/pascal/projekte/jobsync/src/components/staging/StagedVacancyDetailContent.tsx`
- `/home/pascal/projekte/jobsync/src/components/staging/StagedVacancyDetailSheet.tsx`
- `/home/pascal/projekte/jobsync/src/components/staging/MatchScoreRing.tsx`
- `/home/pascal/projekte/jobsync/src/hooks/use-media-query.ts` (if not already present)

**Modified:**
- `/home/pascal/projekte/jobsync/src/components/staging/StagedVacancyCard.tsx`
- `/home/pascal/projekte/jobsync/src/components/staging/DeckView.tsx`
- `/home/pascal/projekte/jobsync/src/components/staging/DeckCard.tsx`
- `/home/pascal/projekte/jobsync/src/components/staging/StagingContainer.tsx`
- `/home/pascal/projekte/jobsync/src/hooks/useDeckStack.ts`
- `/home/pascal/projekte/jobsync/src/i18n/dictionaries/*.ts` (4 locales)

**Not touched:**
- `/home/pascal/projekte/jobsync/src/components/automations/DiscoveredJobDetail.tsx` — leave alone; potential phase 2 refactor to share `StagedVacancyDetailContent` is possible but out of scope.
