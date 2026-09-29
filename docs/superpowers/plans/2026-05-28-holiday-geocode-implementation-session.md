# Session-Prompt: Holiday + GeoCode Module Implementierung

**Ziel:** Implementierung von ROADMAP 1.21 (GeoCode Reference Module) + 1.22 (Holiday Reference Module)

## Vorbereitung (in den Context laden)

Lies diese Dateien ZUERST, bevor du irgendetwas implementierst:

1. `docs/superpowers/specs/2026-05-28-holiday-reference-data-design.md` — Vollständiges Design-Doc mit Dreischicht-Architektur, Dependency-Graph, Architektur-Entscheidungen
2. `specs/geo-codes.allium` — GeoCode Allium Spec (GeoCodeLookupContract, Value Objects)
3. `specs/holiday-reference-data.allium` — Holiday Allium Spec (HolidayLookupContract, Caching-Invarianten)
4. `specs/crm.allium` — CRM Spec (Address mit country_code + subdivision_code)
5. `docs/ROADMAP.md` Sektionen 1.21 + 1.22

## Umsetzung

Verwende `/writing-plans` basierend auf dem Design-Doc, dann implementiere mit `/agent-teams:team-feature` (wshobson).

### Phase 1: Foundation (sequentiell, blockiert den Rest)

**1a. Prisma Migration**
- `addressCountryCode String?` + `addressSubdivisionCode String?` auf Person
- Migration erstellen, `prisma generate`
- Drift-Check: `allium:weed` gegen `specs/crm.allium` Address

**1b. GeoCode Module** (Kern der Dreischicht-Architektur)
- npm: `bun add i18n-iso-countries iso3166-2-db cldr-core`
- Vendor: `countries-data-json` Subdivision-JSONs + `amckenna41/iso3166-2` JSON (3.4MB) in `data/`
- Custom `.d.ts` für `iso3166-2-db` (~30 Zeilen)
- `src/lib/connector/reference-data/modules/geo-codes/`:
  - `index.ts` — GeoCodeService (gegen GeoCodeLookupContract implementieren)
  - `manifest.ts` — ReferenceDataManifest, taxonomy: "geo_codes"
  - `i18n.ts` — Modul-Name/Description in 4 Locales
  - `countries.ts` — Schicht 1: i18n-iso-countries Wrapper
  - `subdivisions.ts` — Schicht 2: countries-data-json + iso3166-2-db Fallback
  - `geo-data.ts` — Schicht 3: amckenna41/iso3166-2 JSON (Codes, Geo, Flags)
  - `nuts-mapping.ts` — Custom NUTS → ISO 3166-2 Crosswalk
- Tests für alle 3 Schichten + Fallback-Verhalten
- **Validierung:** `allium check specs/geo-codes.allium` + Drift-Check gegen Contract

**1c. CountrySelect + SubdivisionSelect UI**
- `/ui-design:create-component` konsultieren (EuresLocationCombobox als Vorlage)
- Combobox mit ISO 3166-1 Codes, lokalisierte Namen, Suche
- SubdivisionSelect: cascading nach Country-Auswahl
- Tests

### Phase 2: Integration (parallelisierbar via `/agent-teams:team-feature`)

```
Stream A: PersonForm Update (Country Freitext → CountrySelect Dropdown)
Stream B: Location.country Promoter Fix (EURES-Codes → Location.country befüllen)
Stream C: Daten-Migration Script (bestehende Person.addressCountry Freitext → Codes)
```

File-Ownership-Boundaries:
- Stream A: `src/components/crm/PersonForm.tsx` + Tests
- Stream B: `src/lib/connector/job-discovery/promoter.ts` + Tests
- Stream C: Neues Migrations-Script + Tests

**Validierung nach Phase 2:** Drift-Check gegen Design-Doc Sektion 3

### Phase 3: Holiday Module

- npm: `bun add date-holidays`
- `src/lib/connector/reference-data/modules/public-holidays/`:
  - `index.ts` — HolidayService (gegen HolidayLookupContract implementieren)
  - `manifest.ts` — ReferenceDataManifest, taxonomy: "holidays"
  - `i18n.ts` — Modul-Name/Description in 4 Locales
  - `caching.ts` — 3-Layer Cache (Day + Instance + Pre-Warm PFLICHT)
  - `weekend.ts` — Intl.Locale.getWeekInfo() + cldr-core Fallback
- Pre-Warm in `src/instrumentation.ts` verdrahten
- Tests inkl. Benchmark-Validierung (Performance aus Design-Doc)
- **Validierung:** `allium check specs/holiday-reference-data.allium` + Drift-Check

### Phase 4: Wiring + Verification

- CRM: Holiday-Info auf PersonDetail anzeigen (Proof-of-Concept)
- `allium:weed` — alle 3 Specs gegen Code abgleichen
- `/comprehensive-review:full-review` — Architecture + Security + Performance + Testing + Best Practices
- Blind Spot Analyse
- Honesty Gate (PFLICHT vor Push)

## Qualitätssicherung (nach JEDER Phase)

1. `allium check` auf betroffene Specs
2. `allium:weed` Drift-Check (Spec ↔ Code)
3. Check gegen Design-Doc (`2026-05-28-holiday-reference-data-design.md`)
4. Tests grün (`bash scripts/test.sh`)
5. Build grün (`source scripts/env.sh && bun run build`)

## Nach Abschluss

1. `/comprehensive-review:full-review`
2. Blind Spot Analyse
3. Honesty Gate (PFLICHT vor Push):
   - Shortcuts genommen? Skills übersprungen? Lücken? Docs aktuell? Handoff vollständig?
4. Memory aktualisieren (`project_roadmap.md`: 1.21 + 1.22 → DONE)

## Referenzen

- Design-Doc: `docs/superpowers/specs/2026-05-28-holiday-reference-data-design.md`
- Allium Specs: `specs/geo-codes.allium`, `specs/holiday-reference-data.allium`, `specs/crm.allium`
- ROADMAP: `docs/ROADMAP.md` §1.21, §1.22
- Evaluierte Pakete: `date-holidays`, `i18n-iso-countries`, `iso3166-2-db`, `countries-data-json`, `amckenna41/iso3166-2`, `cldr-core`
- Abgelehnte Pakete: `@hebcal/core`, `@tabby_ai/hijri-converter`, `iso-3166-2` (olahol), `@siamf/iso3166`, `iso3166-1`, `@trustedshops-public/js-iso3166-converter`
