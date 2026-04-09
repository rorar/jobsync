# Stream C — Staging Job Details Sheet (task 2) — Result

**Status:** Complete. TypeScript clean (`npx tsc --noEmit` exit 0). New test
suite passes 23/23. Existing deck tests (31) still pass — no regressions.

## Files created

| File | Lines | Purpose |
|---|---|---|
| `src/components/staging/StagedVacancyDetailContent.tsx` | 428 | Pure presentational detail view. Renders header, meta row, extended facts grid, description, application instructions, company section, classification, source meta. Contains a local `MatchScoreRing` component (larger than DeckCard's — extracted as suggested by the consultation, but kept local rather than creating a shared file since the prompt's ownership list does NOT include `MatchScoreRing.tsx`). |
| `src/components/staging/StagedVacancyDetailSheet.tsx` | 368 | Responsive Sheet container. `useMediaQuery("(min-width: 640px)")` switches `side` between `"right"` (desktop) and `"bottom"` (mobile). Mode-aware footer renders list-appropriate (promote/dismiss/archive/superlike/block) or deck-appropriate (promote/superlike/dismiss/block/skip) buttons. Auto-closes after any resolved action, tracks `loadingAction` to prevent double-submit. Adds `motion-reduce:!animate-none motion-reduce:!transition-none` on `SheetContent`. |
| `src/hooks/use-media-query.ts` | 46 | SSR-safe `useMediaQuery(query)` hook. Returns `false` during SSR and initial render, subscribes to `matchMedia` on mount, handles legacy Safari via `addListener`/`removeListener` fallback. |
| `__tests__/StagedVacancyDetailSheet.spec.tsx` | 462 | 23 tests covering open/close, all content sections, external link security attrs, SheetTitle presence, list-mode buttons, deck-mode buttons, auto-close on promote/super-like/dismiss, no-description fallback. Mocks `@/components/ui/sheet`, `@/components/ui/scroll-area`, `@/components/ui/company-logo`, and `@/hooks/use-media-query`. |

**Note:** The prompt's "NEW files" list included only
`StagedVacancyDetailContent`, `StagedVacancyDetailSheet`, and
`use-media-query.ts`. `MatchScoreRing.tsx` was mentioned in the consultation
as an optional extraction but NOT in the stream prompt's ownership list, so I
kept my own local `MatchScoreRing` private inside
`StagedVacancyDetailContent.tsx` and left DeckCard's existing inline
`MatchScoreRing` untouched. If Phase 3 wants a shared component later, that
would be a separate extraction task.

## Files edited

| File | Change summary |
|---|---|
| `src/components/staging/StagedVacancyCard.tsx` | Added `onOpenDetails?: (vacancy) => void` prop. Wrapped `CardHeader` + `CardContent` in a `<div role="presentation" onClick={handleBodyClick}>` with `cursor-pointer hover:bg-muted/40` styling that only activates when `onOpenDetails` is set. Added `Info` icon button as the leftmost footer item (when `onOpenDetails` is set) with `aria-label` including the vacancy title. Added `e.stopPropagation()` to the checkbox `onClick` and to every existing footer button's `onClick` to prevent accidental sheet open when clicking action buttons on the card body. |
| `src/components/staging/DeckCard.tsx` | Added optional `onInfoClick?: (vacancy) => void` prop. Rendered a small 28px `Info` icon button inside the card header (next to the MatchScoreRing / source badge group) when `onInfoClick` is set AND the card is NOT a preview. The button uses `onPointerDown` / `onPointerUp` + `onClick` stopPropagation so it never starts a drag. Imported `Info` icon from lucide-react. |
| `src/components/staging/DeckView.tsx` | Added `onOpenDetails?: (vacancy) => void` and `isDetailsOpen?: boolean` props. Destructured them in the component signature. Passed `isDetailsOpen` through to `useDeckStack` to gate its keyboard shortcuts. Added an early-return guard at the top of `handlePointerDown` / `handlePointerMove` / `handlePointerUp` for `isDetailsOpen === true` (plus defensive cleanup in pointer-up if the sheet opened mid-drag). Added a new `useEffect` that registers an `i` keyboard shortcut that calls `onOpenDetails(currentVacancy)` — separate from useDeckStack's handler so it can only fire when the sheet is NOT open. Forwarded `onInfoClick={onOpenDetails}` to the current `<DeckCard>`. Added a new `i` keyboard hint entry to the sm+ keyboard-hint strip (only rendered when `onOpenDetails` is set). |
| `src/hooks/useDeckStack.ts` | Added `isDetailsOpen?: boolean` to `UseDeckStackOptions` with JSDoc. Destructured with default `false`. Added an early `return` in the keyboard-shortcut `useEffect` when `isDetailsOpen === true` so dismiss/promote/super-like/block/skip/undo shortcuts don't fire through the sheet overlay. Added `isDetailsOpen` to the effect's dependency array. |
| `src/i18n/dictionaries/staging.ts` | Added 12 new keys per locale (48 total across en/de/fr/es): `staging.details`, `staging.detailsTitle`, `staging.detailsClose`, `staging.detailsFullDescription`, `staging.detailsAboutCompany`, `staging.detailsApplicationInfo`, `staging.detailsSource`, `staging.detailsOpenExternal`, `staging.detailsNoDescription`, `staging.detailsClassification`, `staging.detailsAutomation`, `staging.requiredExperience`. |
| `src/i18n/dictionaries/deck.ts` | Added 2 new keys per locale (8 total across en/de/fr/es): `deck.detailsTooltip`, `deck.detailsShortcut`. Placed inside a clearly-commented `--- Stream C (task 2): Details sheet shortcuts ---` block at the end of each locale's key list to avoid merge conflicts with Stream D (super-like fly-in). Did NOT touch any existing deck keys. |

## i18n keys added

- **`staging.ts`:** 12 new keys × 4 locales = **48 new translations**
- **`deck.ts`:** 2 new keys × 4 locales = **8 new translations**

Full list of new keys:
- `staging.details` / `staging.detailsTitle` / `staging.detailsClose` / `staging.detailsFullDescription` / `staging.detailsAboutCompany` / `staging.detailsApplicationInfo` / `staging.detailsSource` / `staging.detailsOpenExternal` / `staging.detailsNoDescription` / `staging.detailsClassification` / `staging.detailsAutomation` / `staging.requiredExperience`
- `deck.detailsTooltip` / `deck.detailsShortcut`

## Test file

`__tests__/StagedVacancyDetailSheet.spec.tsx` — 23 tests, all passing.

Coverage highlights:
- **Open/close:** dialog renders when `open=true`, not when `open=false`, does not crash with `vacancy=null`.
- **Content:** title, employer, source badge, full description, application instructions, automation name, working languages, industry codes, occupation URIs (classification), match score, SheetTitle presence.
- **External link security:** `sourceUrl` and `companyUrl` both have `target="_blank"` + `rel="noopener noreferrer"`.
- **List mode:** promote/dismiss/archive buttons rendered, skip NOT rendered, promote button calls handler + auto-closes.
- **Deck mode:** promote/super-like/dismiss/block/skip buttons rendered, archive NOT rendered, super-like calls handler + auto-closes, dismiss calls handler + auto-closes.
- **Fallback:** "No description available" shown when `description` is null.

## Integration hooks for Phase 3 (StagingContainer wiring)

Stream F owns `StagingContainer.tsx`. To integrate this stream's components,
the following wiring is needed:

### 1. Add detail-sheet state to StagingContainer

```tsx
const [detailsVacancy, setDetailsVacancy] =
  useState<StagedVacancyWithAutomation | null>(null);
const [detailsOpen, setDetailsOpen] = useState(false);

const handleOpenDetails = useCallback(
  (vacancy: StagedVacancyWithAutomation) => {
    setDetailsVacancy(vacancy);
    setDetailsOpen(true);
  },
  [],
);
```

### 2. Pass `onOpenDetails` to `StagedVacancyCard` (list mode)

```tsx
<StagedVacancyCard
  ...existingProps
  onOpenDetails={handleOpenDetails}
/>
```

### 3. Pass `onOpenDetails` + `isDetailsOpen` to `DeckView` (deck mode)

```tsx
<DeckView
  ...existingProps
  onOpenDetails={handleOpenDetails}
  isDetailsOpen={detailsOpen}
/>
```

### 4. Render the sheet as a sibling to `PromotionDialog`

```tsx
<StagedVacancyDetailSheet
  vacancy={detailsVacancy}
  open={detailsOpen}
  onOpenChange={setDetailsOpen}
  mode={viewMode === "deck" ? "deck" : "list"}
  onPromote={handlePromote}
  onDismiss={(v) => handleDismiss(v.id)}
  onArchive={(v) => handleArchive(v.id)}
  onBlock={(v) => v.employerName && handleBlockCompany(v.employerName)}
  // Deck-only — wire to the same server action handlers useDeckStack uses
  onSuperLike={(v) => handleDeckAction(v, "superlike")}
  onSkip={(v) => handleDeckAction(v, "skip")}
/>
```

### Important integration notes

1. **Handler signature adapter.** The existing `handleDismiss` /
   `handleArchive` in StagingContainer take an `id: string`, but the sheet's
   props take a `vacancy: StagedVacancyWithAutomation`. The wiring must
   adapt with a small closure as shown above. This was intentional — the
   sheet passes the full vacancy so the handler can access every field if
   needed.

2. **Deck mode actions go through `handleDeckAction`, not the hook.** When
   mode is `"deck"` and the sheet fires an action, the container must route
   it through `handleDeckAction(vacancy, action)` so stats/undo bookkeeping
   happens. The sheet itself does NOT call into `useDeckStack` — it only
   reports user intent via callbacks.

3. **Auto-close is handled inside the sheet.** After any action callback
   resolves (including Promise rejection), the sheet calls
   `onOpenChange(false)`. The container does NOT need to manually close it.

4. **Deck position preservation.** `DeckView` already gates drag + keyboard
   while `isDetailsOpen === true`. The container just needs to pass
   `isDetailsOpen={detailsOpen}` when the sheet is open. The underlying
   `useDeckStack` currentIndex is NOT mutated on sheet open or close — only
   actual actions (promote/dismiss/superlike/block/skip) advance the stack.

5. **Keyboard `i` shortcut.** Already wired in `DeckView`. Works when the
   deck container has focus AND the sheet is NOT already open. No extra
   wiring needed in StagingContainer.

6. **Card body click semantics.** `StagedVacancyCard` uses a non-focusable
   `<div role="presentation">` wrapper for mouse affordance. Keyboard / SR
   users rely on the explicit Details footer button (with aria-label
   including the vacancy title). This avoids the "interactive inside
   interactive" a11y violation since the card contains a checkbox and
   multiple buttons.

## Open decisions / items NOT done

- **`StagingContainer.tsx` wiring:** Stream F owns it — not modified per
  ownership boundary. See "Integration hooks" section above for the exact
  required changes.
- **`MatchScoreRing.tsx` shared extraction:** NOT done. The consultation
  suggested extracting `MatchScoreRing` from `DeckCard.tsx` into a shared
  component, but that file was NOT in this stream's ownership list. Kept my
  own local `MatchScoreRing` inside `StagedVacancyDetailContent` and left
  DeckCard's copy unchanged. A future cleanup task could merge them.
- **Next/Previous navigation inside the sheet (v1.1 polish):** Explicitly
  out of scope per the consultation. Sheet has one card at a time; close to
  return to the deck.
- **URL-based deep link (`/staging/:id`):** Explicitly out of scope per the
  consultation.
- **Inline `Dialog`-mocked test for Radix Sheet behavior:** The test suite
  mocks the Sheet primitive inline (like `ConflictWarningDialog.spec.tsx`
  does with AlertDialog) because Radix portals don't work in JSDOM. The
  real focus-trap / ESC / overlay click behavior is inherited from Radix
  `Dialog` and exercised via Playwright E2E in `e2e/crud/staging-details.spec.ts`
  (to be added by Stream F or the integration phase).

## Verification

```bash
# TypeScript
npx tsc --noEmit        # exit 0, zero errors

# Unit tests
npx jest __tests__/StagedVacancyDetailSheet.spec.tsx --no-coverage
# 23 passed, 0 failed

# Regression check for deck-related tests
npx jest __tests__/useDeckStack.spec.ts __tests__/DeckView.spec.tsx \
  __tests__/a11y-deck-view.spec.tsx --no-coverage
# 31 passed, 0 failed
```
