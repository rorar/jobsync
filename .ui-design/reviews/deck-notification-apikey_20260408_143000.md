# Design Review: DeckView, Notifications, ApiKeySettings

**Review ID:** deck-notification-apikey_20260408_143000
**Reviewed:** 2026-04-08 14:30
**Target:** DeckView.tsx, DeckCard.tsx, StagingContainer.tsx, NotificationDropdown.tsx, NotificationItem.tsx, ApiKeySettings.tsx
**Focus:** Usability (DAU/BDU analysis), Visual Design

## Summary

The new DeckView features add powerful functionality (block, skip, auto-approve) but introduce cognitive overload through 6+ action buttons without clear visual grouping. The destructive "block company" action lacks confirmation and sits dangerously close to the dismiss button. Notification improvements are solid but the job link is too subtle. The ENV badge in API Key Settings communicates status but not actionability.

**Issues Found:** 13

- Critical: 1
- Major: 4
- Minor: 5
- Suggestions: 3

## Critical Issues

### Issue 1: Block company has no confirmation dialog — destructive, hard-to-reverse action

**Severity:** Critical
**Location:** `StagingContainer.tsx:243-254`, `DeckView.tsx:280-292`
**Category:** Usability

**Problem:**
Clicking the block button (or swiping down) immediately blacklists the company AND dismisses the vacancy. This is a two-part destructive action with no confirmation. A DAU who accidentally swipes down will:
1. Blacklist the company (affecting ALL future vacancies from that employer)
2. Lose the current vacancy from the deck

**Impact:**
Accidental company blocking is hard to reverse — the user must navigate to Settings → Company Blacklist to undo. The action radius is project-wide (all automations), not just the current vacancy.

**Recommendation:**
Add an AlertDialog confirmation before executing the block, similar to how module deactivation already has one. Show the company name and explain consequences.

```tsx
// Before: immediate execution
block();

// After: confirmation dialog
setBlockConfirmVacancy(vacancy);
setBlockConfirmOpen(true);
```

## Major Issues

### Issue 2: 6 action buttons without visual grouping — cognitive overload

**Severity:** Major
**Location:** `DeckView.tsx:264-346`
**Category:** Usability

**Problem:**
The action bar shows 6 buttons (dismiss, block, super-like, promote, skip, undo) in a flat row. A DAU sees an undifferentiated cluster. There's no visual separation between:
- Negative actions (dismiss, block)
- Positive actions (super-like, promote)
- Neutral actions (skip, undo)

**Impact:**
New users will hesitate or misclick. The learning curve is steep for a "swipe to decide" UI that should feel instant and intuitive.

**Recommendation:**
Group buttons with visual separators or spacing:
```
[Dismiss] [Block] — gap — [SuperLike] [Promote] — gap — [Skip] [Undo]
```
Or use a `border-l border-border` divider between groups.

### Issue 3: Block button too close to dismiss — accidental blacklisting

**Severity:** Major
**Location:** `DeckView.tsx:267-292`
**Category:** Usability

**Problem:**
The block button (h-10 w-10, 40px) sits directly next to the dismiss button (h-14 w-14, 56px) with only `gap-4` (16px) between them. On mobile, fat-finger misclicks between dismiss and block are likely. The visual similarity (both red-toned) increases confusion.

**Impact:**
User intends to dismiss one vacancy but accidentally blacklists the entire company.

**Recommendation:**
Either: (a) move block button to a different location (e.g., inside the card's menu), or (b) increase gap between dismiss and block to at least `gap-6`, or (c) add the confirmation dialog from Issue 1.

### Issue 4: Auto-approve checkbox lacks explanation

**Severity:** Major
**Location:** `DeckView.tsx:348-357`
**Category:** Usability

**Problem:**
The "Auto-approve" checkbox label gives no context about what it does. A DAU won't know it skips the PromotionDialog and creates jobs with default field values. This is significant because auto-approved jobs can't have their title/company/location overridden.

**Impact:**
User enables auto-approve thinking it's a "fast mode", then can't find where to edit the job details that were auto-filled.

**Recommendation:**
Add a subtitle or InfoTooltip explaining the behavior:
```tsx
<label>
  <input type="checkbox" ... />
  {t("deck.autoApprove")}
  <InfoTooltip content={t("deck.autoApproveHint")} />
</label>
```
i18n: "Skip the promotion dialog and create jobs with default values"

### Issue 5: Notification "View job" link too subtle

**Severity:** Major
**Location:** `NotificationItem.tsx:142-157`
**Category:** Usability

**Problem:**
The "View job" link for `vacancy_promoted` notifications is rendered in `text-xs text-muted-foreground` inside the timestamp row. It's the most actionable element in the notification, but it has the lowest visual weight.

**Impact:**
Users get a "Job created" notification but don't find the link to the created job. They navigate manually to My Jobs instead.

**Recommendation:**
Make the link a distinct, visible element — either a small button or a more prominent text link with the job title:
```tsx
{link && link.labelKey && (
  <Link href={link.href} className="text-sm text-primary hover:underline mt-1 inline-flex items-center gap-1">
    {t(link.labelKey)} <ExternalLink className="h-3 w-3" />
  </Link>
)}
```

## Minor Issues

### Issue 6: Skip and undo buttons visually identical

**Severity:** Minor
**Location:** `DeckView.tsx:322-345`
**Category:** Visual

**Problem:**
Both skip (ChevronRight) and undo (Undo2) use `h-10 w-10 rounded-full bg-muted text-muted-foreground`. The only difference is the icon inside. At glance, they look like the same button.

**Recommendation:**
Differentiate undo visually — e.g., slightly different background or a dashed border:
```tsx
className="... border border-dashed border-muted-foreground/30"
```

### Issue 7: "N" key for skip is unintuitive

**Severity:** Minor
**Location:** `useDeckStack.ts:203-205`
**Category:** Usability

**Problem:**
"N" for skip (next) conflicts with common expectations where "N" means "No" (= dismiss). Users of Vim-like tools expect "n" for "next match" but general users may confuse it.

**Recommendation:**
Consider using Tab or Right-Arrow (already mapped to promote). Or add a brief tooltip on first use.

### Issue 8: "k.A." badge shows when matchScore is null

**Severity:** Minor
**Location:** `DeckCard.tsx:116-120`
**Category:** Usability

**Problem:**
When `matchScore == null`, a "k.A." (keine Angabe / N/A) badge is shown. This badge adds no information and may confuse users who don't know what "k.A." means. The absence of a score ring already communicates "no score".

**Recommendation:**
Hide the badge entirely when there's no score. The score ring's absence is sufficient.

### Issue 9: ENV badge in ApiKeySettings doesn't indicate actionability

**Severity:** Minor
**Location:** `ApiKeySettings.tsx:416-423`
**Category:** Usability

**Problem:**
The blue "ENV" badge tells the user a key is set via environment variable, but doesn't explain what they should (or shouldn't) do. The tooltip helps but requires hover interaction.

**Recommendation:**
Show the env var name in the tooltip (e.g., "Set via RAPIDAPI_KEY environment variable. A database key takes precedence.") so the user knows which env var is active.

### Issue 10: Swipe down zone overlaps with scroll intent on mobile

**Severity:** Minor
**Location:** `DeckView.tsx:117-119`
**Category:** Usability

**Problem:**
`SWIPE_DISTANCE_Y = 80px` for the swipe-down block action. On mobile, users may attempt to scroll down to read the card's description, but trigger the block action instead. The card has `touchAction: "none"` which prevents scrolling entirely.

**Recommendation:**
Either: (a) increase the threshold for swipe-down to 120px, or (b) require a velocity component (already partially implemented), or (c) only enable swipe-down from the top portion of the card.

## Suggestions

### Suggestion 1: Add visual stats for blocked/skipped in session complete

The session complete screen (`DeckView.tsx:161-164`) includes `stats.blocked` and `stats.skipped` in the total count but doesn't show them separately. Consider adding: "Blocked: X, Skipped: X" to give users a complete picture.

### Suggestion 2: Consider grouping "mark all read" with a count indicator

The icon-only mark-all-read button (`NotificationDropdown.tsx:84-94`) is accessible but not discoverable. Consider adding a small count badge on the CheckCheck icon showing how many unread notifications will be affected.

### Suggestion 3: Add tooltip to sourceBoard badge in DeckCard

The `sourceBoard` badge (`DeckCard.tsx:106`) shows raw values like "eures" without context. A tooltip explaining "Source: EURES European Job Portal" would help DAU users.

## Positive Observations

- Keyboard shortcuts are comprehensive and well-organized with visual hints
- Screen reader support via aria-live regions is thorough
- motion-reduce support on all animations
- focus-visible ring on all interactive elements
- The Promise-ref pattern for cancel-returns-to-deck is architecturally clean
- Auto-approve localStorage persistence with SSR guard is correct
- Button highlight during swipe provides excellent visual feedback

## Next Steps

1. **CRITICAL:** Add confirmation dialog for block company action
2. **MAJOR:** Group action buttons with visual separators
3. **MAJOR:** Add InfoTooltip to auto-approve checkbox
4. **MAJOR:** Make notification job link more prominent
5. **MINOR:** Consider hiding "k.A." badge when matchScore is null

---

_Generated by UI Design Review. Run `/ui-design:design-review` again after fixes._
