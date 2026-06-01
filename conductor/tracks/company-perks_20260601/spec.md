# Specification: Company Perks / Gimmicks

**Track ID:** company-perks_20260601
**Type:** Feature
**Status:** Draft
**Created:** 2026-06-01

## Summary

Capture non-salary job perks ("Gimmicks") as a categorized, **extensible** multiselect:
the user picks from curated category→item options AND can add their own categories and
items (mirror the existing ChipList / TagInput + "add new option" combobox pattern, e.g.
EuresLanguageCombobox / findOrCreate).

## Origin / Requested scope (@rorar, 2026-06-01, item 6)

Multiselect combobox with the option to add new categories and items. Seed categories:

- **Mobility** → `Company Car`, `Company Bike`
- **Feel-Good** → `Office Dogs allowed`, `Free Coffee`, `Free Meals`
- **Discounts** → `Discount for own Products`, `Corporate Benefits`
- … (user-extensible)

## Salary linkage (keep in mind for development)

Some perks affect net pay — notably a **Company Car** in Germany (1% / 0.5% taxation
rule). When the company-car perk is selected, the **Salary Calculator** module
(salary-calculator_20260601) should be able to factor it into gross↔net.
Reference (only): https://rechner-hub.de/api-dokumentation/firmenwagen/

Model the perk so this linkage is possible later: a perk item may carry optional
structured attributes (e.g. company-car list price + private-use rule) rather than being
a bare label. Build extensibly — do NOT hard-code the category/item set.

## Acceptance Criteria (draft)

- [ ] A Perk taxonomy: categories + items, seeded with the above, user-extensible
      (add category / add item), following the existing add-new-option combobox pattern.
- [ ] Attach perks to a Job (and/or Company — decide aggregate ownership; likely Job,
      possibly promotable from Company defaults).
- [ ] Company-car perk can carry optional structured attributes for the future salary
      linkage (forward-compatible shape; calc itself is the Salary Calculator track).
- [ ] Multiselect UI with categories (grouped), add-new, remove; responsive + WCAG AA.
- [ ] Tests + i18n (4 locales) for the seed categories/items.

## Out of Scope

- The gross↔net effect computation itself (Salary Calculator track).
- Per-company perk analytics.

## Dependencies

- Existing ChipList / multiselect-combobox-with-add patterns.
- Cross-link: Salary Calculator track (company-car net-pay effect).
- Decide: does this belong to the Job aggregate, the Company aggregate, or a shared
  reference taxonomy? (DDD — resolve before implementing.)
