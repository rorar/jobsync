# Next Session Follow-ups (post 1.21 + 1.22)

## From 2026-05-28 GeoCode + Holiday Session

### 1. PersonDetail Holiday PoC (Phase 4 deferred)
PersonDetailClient.tsx should display holiday info for a contact's country.
- Read `addressCountryCode` + `addressSubdivisionCode` from Person
- Call HolidayService via server action to check today's date
- Show "Public holiday in [country]" badge if applicable
- Show "Weekend in [country]" indicator if applicable
- Low priority — proof of concept, not blocking

### 2. `/comprehensive-review:full-review` (recommended before next feature)
Run the full 5-dimensional review (Architecture + Security + Performance + Testing + Best Practices) on the 10 commits from this session. Security-Auditor and Performance-Engineer were run as separate agents during Step 7, but the orchestrated `/comprehensive-review:full-review` skill was not invoked.

### 3. Data Migration Script (Stream C — out of scope)
Existing `Person.addressCountry` free-text values should be normalized to `addressCountryCode` via `GeoCodeService.normalizeCountry()`. Script approach:
```typescript
// For each Person where addressCountry is set but addressCountryCode is null:
const code = geoCodeService.normalizeCountry(person.addressCountry);
if (code) await prisma.person.update({ where: { id, userId: user.id }, data: { addressCountryCode: code } });
```
Low priority — new persons get codes via CountrySelect.

### 4. `/ui-design:create-component` for CountrySelect (skipped)
The session plan prescribed consulting the ui-design agent before creating CountrySelect + SubdivisionSelect. This was skipped — components follow the EuresLocationCombobox pattern. A post-hoc ui-design:design-review would catch any UX issues.

### 5. Accepted Performance Findings (deferred)
- P-5: DayCache unbounded growth — add maxSize: 500 with LRU eviction
- P-6: dateSet removed (DONE in weed fix)
- P-7: isHolidayBatch cache key optimization
- P-10: Linear scan in iso3166-2-db fallback — convert to Map

### 6. Accepted Security Findings (deferred)
- S-3: Sub-modules lack `import "server-only"` (defense-in-depth)
- S-5: getSubdivisionFlag returns external GitHub URLs (future risk)
- S-7: getPersons pageSize not bounded (pre-existing)

### 7. Allium Spec: get_countries/get_subdivisions in HolidayLookupContract
`holiday-reference-data.allium` lines 87-88 declare `get_countries` and `get_subdivisions` in `HolidayLookupContract`. The implementation delegates these to GeoCodeService (Weed Report Finding #13, "Intentional gap"). Resolution options:
- **A) Remove from HolidayLookupContract** — contract should describe only what HolidayService itself implements (cleaner per DDD)
- **B) Keep + add @guidance** — document that HolidayService delegates to GeoCodeService

Recommend Option A — the contract should reflect the module's own responsibility boundary.
