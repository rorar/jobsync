# Design Review: Combobox Keyboard UX

**Review ID:** combobox-keyboard-ux_20260326
**Reviewed:** 2026-03-26
**Target:** specs/ui-combobox-keyboard.allium + 4 component implementations
**Focus:** Usability (keyboard interaction, focus management, accessibility)

## Summary

The Allium spec provides a solid behavioural foundation for keyboard interaction across all four combobox variants. The rules are well-structured and cover the critical paths. However, the review identifies **3 major issues** related to a critical cmdk framework interaction conflict, a missing spec rule for hierarchical comboboxes, and an accessibility gap — plus **4 minor issues** and **2 suggestions** for hardening.

**Issues Found:** 9

- Critical: 0
- Major: 3
- Minor: 4
- Suggestions: 2

## Major Issues

### Issue 1: cmdk Enter Key Conflict — Framework Will Fight Custom Handler

**Severity:** Major
**Location:** All components using `CommandInput` with custom `onKeyDown`
**Category:** Usability

**Problem:**
The cmdk library (`CommandPrimitive`) natively handles Enter by selecting the currently highlighted `CommandItem` via its `onSelect` callback. When a custom `onKeyDown` handler on `CommandInput` intercepts Enter with `e.preventDefault()`, it prevents the native cmdk selection — but only if `preventDefault` fires *before* cmdk's internal handler.

The spec's `EnterWithInputCreatable` rule calls for `preventDefault` + custom creation logic. In practice, cmdk may fire `onSelect` on the highlighted item *before* the `onKeyDown` handler runs (depending on event propagation order). This creates a race condition:
- If cmdk fires first: the highlighted item is selected AND the custom handler creates a new option.
- If `onKeyDown` fires first with `preventDefault`: cmdk's selection is suppressed — correct.

The EuresOccupationCombobox (lines 317-324) already uses this pattern and appears to work, but only because it uses `shouldFilter={false}` which changes cmdk's internal Enter handling.

**Impact:**
BaseCombobox (ComboBox.tsx) uses `shouldFilter` with a custom filter function (line 87-89), which means cmdk's native Enter→select is active. Adding `onKeyDown` with `e.preventDefault()` here could cause double-selection or no selection depending on timing.

**Recommendation:**
Add a spec guidance note and implementation constraint:

1. **All comboboxes using custom Enter handling MUST set `shouldFilter={false}` on the `Command` component** and handle filtering manually. This disables cmdk's native Enter→select behaviour, giving the custom handler full control.
2. Alternatively, use `e.stopPropagation()` in addition to `e.preventDefault()` to prevent cmdk from seeing the Enter event.
3. The spec should add a `@guidance` note to `EnterWithInputCreatable` documenting this framework constraint.

**Code Example:**
```tsx
// BaseCombobox must change from:
<Command filter={(value, search) => value.includes(search.toLowerCase()) ? 1 : 0}>

// To:
<Command shouldFilter={false}>
// + manual filtering in useMemo/useState
```

---

### Issue 2: Missing Spec Rule for Hierarchical Expand/Collapse on Enter

**Severity:** Major
**Location:** specs/ui-combobox-keyboard.allium — missing rule
**Category:** Usability

**Problem:**
The EuresLocationCombobox has a unique interaction: pressing Enter (or selecting) on a country with child regions *toggles expansion* rather than selecting the country. The spec's `EnterWithInputCreatable` and `EnterWithInputNonCreatable` rules don't account for this hierarchical navigation pattern.

Current code (EuresLocationCombobox.tsx lines 365-371):
```tsx
onSelect={() => {
  if (hasRegions && !inputValue) {
    toggleExpand(country.code);
  } else {
    addCode(country.code);
  }
}}
```

This means Enter/select on "Germany" (which has NUTS regions) expands the tree to show DE1, DE2, etc. — it does NOT add "de" to the selection. Only when the user is searching (inputValue is non-empty) does Enter on "Germany" select it.

**Impact:**
The spec rule `EnterWithInputNonCreatable` would incorrectly expect a selection when pressing Enter on a hierarchical node with children.

**Recommendation:**
Add a new rule to the spec:

```allium
rule EnterOnHierarchicalNode {
    -- Enter/select on a node with children toggles expand (no selection)
    when: KeyPress(combobox, event)
    requires:
        event.key = enter
        combobox.popover_state = open
        event.has_highlighted_item
        highlighted_item_has_children
        not combobox.has_input  -- only when NOT searching
    ensures:
        HierarchyToggled(combobox, node: highlighted_item)
        -- No selection, no popover close

    @guidance
        -- When the user IS typing (has_input = true), Enter selects
        -- the node directly (adds the code). This matches the existing
        -- EuresLocationCombobox behaviour.
}
```

---

### Issue 3: ARIA Live Region Not Specified for Selection Feedback

**Severity:** Major
**Location:** specs/ui-combobox-keyboard.allium — `@guarantee AccessibleKeyboardNavigation`
**Category:** Accessibility

**Problem:**
The spec's `@guarantee AccessibleKeyboardNavigation` mentions ARIA live regions for popover open/close announcements, but does NOT specify screen reader feedback for:
1. **Selection confirmation** — when Enter creates/adds an item, screen readers should announce "Added [item name]" or "Created [item name]"
2. **Max limit rejection** — when `EnterAtMaxLimit` fires, screen readers should announce the warning (not just a visual toast)
3. **Current count** — multi-select comboboxes should announce "N of M items selected" on change

Current code has NO `aria-live` regions on any of the four components. Radix Popover provides some built-in announcements, but selection outcomes are entirely visual.

**Impact:**
Screen reader users cannot confirm their selections, especially in multi-select mode where the popover stays open. They would have no feedback that their Enter keystroke did anything.

**Recommendation:**
1. Add to the spec's `ComboboxKeyboardSurface`:
   ```
   @guarantee SelectionAnnounced
       -- Every SelectionPerformed outcome is announced to assistive technology
       -- via an aria-live="polite" region. Created: "Created [name]".
       -- Added: "[name] added, N of M". Rejected: "Maximum reached".
   ```
2. Implementation: add a `<span role="status" aria-live="polite" className="sr-only">` that updates on each selection.

---

## Minor Issues

### Issue 4: TagInput Closes Popover After Selection — Contradicts Multi-Select Spec

**Severity:** Minor
**Location:** `src/components/myjobs/TagInput.tsx:89,96`
**Category:** Usability

**Problem:**
TagInput's `handleCreate` (line 89) and `handleSelect` (line 96) both call `setOpen(false)`, closing the popover after each selection. But the spec's `EnterWithInputCreatable` rule for `multi_select` mode says the popover should stay open for rapid multi-entry.

TagInput is a multi-select component (add multiple tags). Closing after each selection forces the user to re-open the popover for each tag — poor UX when adding 3-5 tags in sequence.

**Recommendation:**
Update TagInput to keep popover open after selection (matching EuresOccupationCombobox pattern). Only close on Tab or Escape.

```tsx
// handleSelect — REMOVE setOpen(false)
const handleSelect = (tagId: string) => {
  addTagById(tagId);
  setInputValue("");
  // setOpen(false);  ← remove
};

// handleCreate — REMOVE setOpen(false)
// ...keep popover open after creation
```

---

### Issue 5: BaseCombobox `aria-expanded` Missing

**Severity:** Minor
**Location:** `src/components/ComboBox.tsx:66`
**Category:** Accessibility

**Problem:**
The trigger Button has `role="combobox"` but does NOT have `aria-expanded={isPopoverOpen}`. Compare with TagInput (line 106) and EuresLocationCombobox (line 316) which both correctly include `aria-expanded`.

**Recommendation:**
Add `aria-expanded={isPopoverOpen}` to the trigger Button.

---

### Issue 6: BaseCombobox Input Not Cleared on Popover Close via Outside Click

**Severity:** Minor
**Location:** `src/components/ComboBox.tsx:62`
**Category:** Usability

**Problem:**
The spec's invariant `PopoverClosedMeansEmptyInput` requires that input is cleared whenever the popover closes. However, `onOpenChange` on the Popover (line 62) sets `isPopoverOpen` to false but does NOT clear `newOption`. If the user types "Soft" then clicks outside, the input retains "Soft" on next open.

**Recommendation:**
```tsx
<Popover open={isPopoverOpen} onOpenChange={(open) => {
  setIsPopoverOpen(open);
  if (!open) setNewOption("");
}}>
```

---

### Issue 7: Spec EnterWithoutInput Conflicts with cmdk Default

**Severity:** Minor
**Location:** specs/ui-combobox-keyboard.allium — `EnterWithoutInput` rule
**Category:** Usability

**Problem:**
The rule says Enter with empty input is a no-op. But cmdk's default behaviour when Enter is pressed with empty input is to select the first highlighted item (cmdk always highlights the first item by default). So Enter on an empty input would actually select the first option via cmdk's native handler.

**Recommendation:**
Either:
1. Update the rule to acknowledge cmdk's default: "Enter with empty input selects the highlighted item if one exists" (let cmdk handle it)
2. Or add `e.preventDefault()` when input is empty AND the intent is truly no-op (which would fight cmdk again)

Option 1 is better — let cmdk's native behaviour handle this case.

---

## Suggestions

### Suggestion 1: Add `type="button"` to BaseCombobox Trigger

**Location:** `src/components/ComboBox.tsx:65`

The trigger Button inside `FormControl` defaults to `type="submit"` in form context, which could cause accidental form submission. TagInput (line 112) and EuresLocationCombobox (line 322) both correctly include `type="button"`. BaseCombobox does not.

Add `type="button"` to prevent accidental form submission.

---

### Suggestion 2: Consider Debounce for BaseCombobox Filter

**Location:** `src/components/ComboBox.tsx:87-89`

The custom filter function runs synchronously on every keystroke. For option lists of 50+ items, this is fine. But if the option list grows (e.g., all job titles across the system), consider debouncing or virtualizing the list. The spec's `config.debounce_ms` is currently only noted for async search — consider extending guidance.

---

## Positive Observations

- **EuresOccupationCombobox is the gold standard** — it already implements Enter-to-create (lines 317-324), uses `shouldFilter={false}`, debounces API calls, and keeps popover open for multi-select. Other components should follow this exact pattern.
- **Consistent use of Radix Popover + cmdk across all variants** — this makes a unified keyboard spec feasible and reduces implementation risk.
- **TagInput properly disables when max reached** (`disabled={isMaxReached}` on trigger) — good preventive UX.
- **EuresLocationCombobox's tree rendering** is well-structured with recursive `renderLocationNodes` — the hierarchical interaction is non-trivial and well-executed for mouse/touch.
- **The Allium spec's invariant `TabNeverPrevented`** is an excellent safety rail that prevents a common accessibility regression.

## Next Steps

1. **Address Major Issue 1 first** — the cmdk Enter conflict affects BaseCombobox implementation strategy. Switch to `shouldFilter={false}` before adding `onKeyDown`.
2. **Add hierarchical Enter rule** (Issue 2) to the Allium spec before implementation begins.
3. **Add ARIA live region plan** (Issue 3) — define the announcement format per outcome.
4. **Fix TagInput popover-close behaviour** (Issue 4) — quick change, align with spec.
5. **Fix BaseCombobox `aria-expanded` and `type="button"`** (Issues 5, Suggestion 1) — quick wins.
6. **Fix input clearing on outside click** (Issue 6) — enforce PopoverClosedMeansEmptyInput invariant.

---

_Generated by UI Design Review. Run `/ui-design:design-review` again after fixes._
