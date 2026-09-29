# GeoCode + Holiday Reference Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ROADMAP 1.21 (GeoCode Reference Module) + 1.22 (Holiday Reference Module) as Reference Data Modules under the existing Reference Data Connector (1.20).

**Architecture:** Three-layer GeoCode service (npm country names + npm subdivision names + vendored geo/flags data) provides ISO 3166-1/3166-2 lookups. Holiday service wraps `date-holidays` with 3-layer caching (day-cache, instance-cache, pre-warm). Both are globalThis singletons following the RunCoordinator/EventBus pattern. UI components (CountrySelect, SubdivisionSelect) follow the EuresLocationCombobox Combobox pattern.

**Tech Stack:** `i18n-iso-countries` (countries), `iso3166-2-db` (subdivisions), `date-holidays` (holidays), `cldr-core` (weekend fallback), Prisma migration, Shadcn Combobox, Jest tests.

**Design Doc:** `docs/superpowers/specs/2026-05-28-holiday-reference-data-design.md`
**Allium Specs:** `specs/geo-codes.allium`, `specs/holiday-reference-data.allium`

---

## File Structure

### New Files (GeoCode Module)
- `src/lib/connector/reference-data/modules/geo-codes/index.ts` — GeoCodeService singleton (GeoCodeLookupContract)
- `src/lib/connector/reference-data/modules/geo-codes/manifest.ts` — ReferenceDataManifest, taxonomy: "geo_codes"
- `src/lib/connector/reference-data/modules/geo-codes/i18n.ts` — ModuleI18n (4 locales)
- `src/lib/connector/reference-data/modules/geo-codes/countries.ts` — Layer 1: i18n-iso-countries wrapper
- `src/lib/connector/reference-data/modules/geo-codes/subdivisions.ts` — Layer 2: iso3166-2-db wrapper
- `src/lib/connector/reference-data/modules/geo-codes/nuts-mapping.ts` — NUTS → ISO 3166-2 crosswalk
- `src/lib/connector/reference-data/modules/geo-codes/types.ts` — CountryInfo, SubdivisionInfo, RegionInfo, GeoCoordinate
- `src/types/iso3166-2-db.d.ts` — Type declarations for iso3166-2-db
- `__tests__/geo-codes.spec.ts` — Unit tests for GeoCodeService

### New Files (Holiday Module)
- `src/lib/connector/reference-data/modules/public-holidays/index.ts` — HolidayService singleton (HolidayLookupContract)
- `src/lib/connector/reference-data/modules/public-holidays/manifest.ts` — ReferenceDataManifest, taxonomy: "holidays"
- `src/lib/connector/reference-data/modules/public-holidays/i18n.ts` — ModuleI18n (4 locales)
- `src/lib/connector/reference-data/modules/public-holidays/caching.ts` — 3-layer cache (day + instance + pre-warm)
- `src/lib/connector/reference-data/modules/public-holidays/weekend.ts` — Intl.getWeekInfo + cldr-core fallback
- `src/lib/connector/reference-data/modules/public-holidays/types.ts` — HolidayEntry, HolidayType, HolidayCheckOptions
- `__tests__/holiday-service.spec.ts` — Unit tests for HolidayService
- `__tests__/weekend-service.spec.ts` — Unit tests for WeekendService

### New Files (UI Components)
- `src/components/ui/country-select.tsx` — CountrySelect combobox
- `src/components/ui/subdivision-select.tsx` — SubdivisionSelect cascading combobox
- `__tests__/CountrySelect.spec.tsx` — Component tests
- `__tests__/SubdivisionSelect.spec.tsx` — Component tests

### Modified Files
- `prisma/schema.prisma` — Add `addressCountryCode`, `addressSubdivisionCode` on Person
- `src/lib/connector/register-all.ts` — Add import for geo-codes + public-holidays
- `src/lib/data/testFixtures.ts` — Add addressCountryCode/addressSubdivisionCode to PersonFixture
- `src/actions/person.actions.ts` — Add addressCountryCode/addressSubdivisionCode to CreatePersonInput/UpdatePersonInput
- `src/components/crm/PersonForm.tsx` — Replace country Input with CountrySelect, add SubdivisionSelect
- `src/app/dashboard/contacts/[id]/PersonDetailClient.tsx` — Display holiday info (PoC)
- `src/lib/connector/job-discovery/types.ts` — Add `countryCode?` to DiscoveredVacancy
- `src/lib/connector/job-discovery/modules/eures/index.ts` — Populate countryCode on DiscoveredVacancy
- `src/lib/connector/job-discovery/reference-data.ts` — Populate Location.country from countryCode
- `src/models/person.model.ts` — Add addressCountryCode/addressSubdivisionCode to relevant types
- `src/i18n/dictionaries/crm.ts` — Add country/subdivision i18n keys
- `src/instrumentation.ts` — Wire holiday pre-warm
- `tsconfig.json` — Add path to custom type declarations (if needed)

---

## Phase 1: Foundation (Sequential — blocks all other phases)

### Task 1: Install Dependencies and Type Declarations

**Files:**
- Modify: `package.json`
- Create: `src/types/iso3166-2-db.d.ts`

- [ ] **Step 1: Install npm packages**

```bash
cd /home/pascal/projekte/jobsync
bun add i18n-iso-countries iso3166-2-db date-holidays cldr-core
```

Expected: 4 packages added to `package.json` dependencies.

- [ ] **Step 2: Create type declarations for iso3166-2-db**

`iso3166-2-db` has no TypeScript types. Create `src/types/iso3166-2-db.d.ts`:

```typescript
declare module "iso3166-2-db" {
  interface SubdivisionData {
    name: string;
    type: string;
    parent?: string;
    /** Localized names keyed by ISO 639-1 locale */
    names?: Record<string, string>;
  }

  interface CountryData {
    name: string;
    sub: Record<string, SubdivisionData>;
  }

  /** Full database keyed by ISO 3166-1 alpha-2 country code */
  const db: Record<string, CountryData>;
  export default db;

  /**
   * Get subdivisions for a country.
   * @param country ISO 3166-1 alpha-2 code
   * @param language ISO 639-1 locale code (default: "en")
   */
  export function getDataByCountry(
    country: string,
    language?: string,
  ): CountryData | undefined;

  /**
   * Get a single subdivision.
   * @param code Full ISO 3166-2 code like "DE-BY"
   * @param language ISO 639-1 locale code (default: "en")
   */
  export function getDataByCode(
    code: string,
    language?: string,
  ): SubdivisionData | undefined;
}
```

- [ ] **Step 3: Verify TypeScript picks up the declarations**

Run: `cd /home/pascal/projekte/jobsync && source scripts/env.sh && npx tsc --noEmit --pretty 2>&1 | tail -5`

If tsc doesn't find the declarations, add to `tsconfig.json`:
```json
"typeRoots": ["./node_modules/@types", "./src/types"]
```

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock src/types/iso3166-2-db.d.ts tsconfig.json
git commit -m "feat(geo): add i18n-iso-countries, iso3166-2-db, date-holidays, cldr-core dependencies

Add type declarations for iso3166-2-db (no @types package available).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Prisma Migration — addressCountryCode + addressSubdivisionCode

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/data/testFixtures.ts`
- Modify: `src/models/person.model.ts`
- Modify: `src/actions/person.actions.ts`

- [ ] **Step 1: Add fields to Person model in Prisma schema**

In `prisma/schema.prisma`, inside `model Person`, after `addressCountry String?`, add:

```prisma
  addressCountryCode      String?  // ISO 3166-1 alpha-2 ("DE", "US") — structured, from CountrySelect
  addressSubdivisionCode  String?  // ISO 3166-2 subdivision ("BY", "CA") — structured, from SubdivisionSelect
```

- [ ] **Step 2: Run migration**

```bash
cd /home/pascal/projekte/jobsync
bash scripts/prisma-migrate.sh
```

When prompted for a migration name, use: `add_person_address_codes`

Then regenerate client:
```bash
bash scripts/prisma-generate.sh
```

- [ ] **Step 3: Update PersonFixture in testFixtures.ts**

In `src/lib/data/testFixtures.ts`, add to `PersonFixture` interface:

```typescript
addressCountryCode: string | null;
addressSubdivisionCode: string | null;
```

Add to `mockPerson`:
```typescript
addressCountryCode: "DE",
addressSubdivisionCode: "BE", // Berlin
```

Add to `mockPersonAnonymized`:
```typescript
addressCountryCode: null,
addressSubdivisionCode: null,
```

- [ ] **Step 4: Update person.model.ts types**

In `src/models/person.model.ts`, find any type/interface that lists address fields and add:

```typescript
addressCountryCode?: string | null;
addressSubdivisionCode?: string | null;
```

- [ ] **Step 5: Update person.actions.ts input types**

In `src/actions/person.actions.ts`:

Add to `CreatePersonInput`:
```typescript
addressCountryCode?: string | null;
addressSubdivisionCode?: string | null;
```

Add to `UpdatePersonInput`:
```typescript
addressCountryCode?: string | null;
addressSubdivisionCode?: string | null;
```

In `createPerson()`, add to the `prisma.person.create({ data: ... })`:
```typescript
addressCountryCode: input.addressCountryCode ?? null,
addressSubdivisionCode: input.addressSubdivisionCode ?? null,
```

In `updatePerson()`, add alongside existing address field updates:
```typescript
if (input.addressCountryCode !== undefined) data.addressCountryCode = input.addressCountryCode;
if (input.addressSubdivisionCode !== undefined) data.addressSubdivisionCode = input.addressSubdivisionCode;
```

In `anonymizePerson()`, add to the nullification block:
```typescript
addressCountryCode: null,
addressSubdivisionCode: null,
```

- [ ] **Step 6: Run tests to verify nothing broke**

```bash
cd /home/pascal/projekte/jobsync && bash scripts/test.sh 2>&1 | tail -20
```

Expected: All existing tests pass (new fields are nullable, so no breaking changes).

- [ ] **Step 7: Commit**

```bash
git add prisma/ src/lib/data/testFixtures.ts src/models/person.model.ts src/actions/person.actions.ts
git commit -m "feat(crm): add addressCountryCode + addressSubdivisionCode to Person

ISO 3166-1 alpha-2 country codes and ISO 3166-2 subdivision codes for
structured address data. Nullable for GDPR anonymization. Foundation
for ROADMAP 1.21 GeoCode Reference Module.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: GeoCode Module — Types + Layer 1 (Countries)

**Files:**
- Create: `src/lib/connector/reference-data/modules/geo-codes/types.ts`
- Create: `src/lib/connector/reference-data/modules/geo-codes/countries.ts`

- [ ] **Step 1: Create domain types**

Create `src/lib/connector/reference-data/modules/geo-codes/types.ts`:

```typescript
/** ISO 3166-1 country info with localized name */
export interface CountryInfo {
  /** ISO 3166-1 alpha-2 code (e.g. "DE") */
  code: string;
  /** Localized country name (e.g. "Germany" or "Deutschland") */
  name: string;
  /** Whether this country has ISO 3166-2 subdivisions */
  hasSubdivisions: boolean;
}

/** ISO 3166-2 subdivision info with localized name */
export interface SubdivisionInfo {
  /** ISO 3166-2 code WITHOUT country prefix (e.g. "BY" not "DE-BY") */
  code: string;
  /** Parent country code */
  countryCode: string;
  /** Localized subdivision name (e.g. "Bayern" or "Bavaria") */
  name: string;
  /** Subdivision type (e.g. "Land", "State", "Province") */
  subdivisionType: string | null;
}

/** NUTS-to-ISO mapping result */
export interface NutsResolution {
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;
  /** ISO 3166-2 subdivision code (without country prefix), or null if no mapping */
  subdivisionCode: string | null;
}
```

- [ ] **Step 2: Create Layer 1 countries wrapper**

Create `src/lib/connector/reference-data/modules/geo-codes/countries.ts`:

```typescript
import countries from "i18n-iso-countries";

// Register locale data for our 4 supported locales
import enLocale from "i18n-iso-countries/langs/en.json";
import deLocale from "i18n-iso-countries/langs/de.json";
import frLocale from "i18n-iso-countries/langs/fr.json";
import esLocale from "i18n-iso-countries/langs/es.json";

countries.registerLocale(enLocale);
countries.registerLocale(deLocale);
countries.registerLocale(frLocale);
countries.registerLocale(esLocale);

import type { CountryInfo } from "./types";

const SUPPORTED_LOCALES = ["en", "de", "fr", "es"] as const;

/**
 * Get all countries with localized names.
 * @param locale ISO 639-1 locale code (default: "en")
 */
export function getCountries(locale: string = "en"): CountryInfo[] {
  const lang = SUPPORTED_LOCALES.includes(locale as any) ? locale : "en";
  const names = countries.getNames(lang, { select: "official" });
  return Object.entries(names)
    .map(([code, name]) => ({
      code,
      name: name as string,
      hasSubdivisions: true, // refined by subdivisions layer
    }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

/**
 * Normalize arbitrary country input to ISO 3166-1 alpha-2.
 * Accepts: alpha-2 ("DE"), alpha-3 ("DEU"), numeric ("276"),
 * or country name in any supported locale ("Germany", "Deutschland").
 * Returns undefined if unrecognizable.
 */
export function normalizeCountry(input: string): string | undefined {
  if (!input || typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Try alpha-2 (case-insensitive)
  const upper = trimmed.toUpperCase();
  if (countries.isValid(upper)) return upper;

  // Try alpha-3 → alpha-2
  const fromAlpha3 = countries.alpha3ToAlpha2(upper);
  if (fromAlpha3) return fromAlpha3;

  // Try numeric → alpha-2
  const fromNumeric = countries.numericToAlpha2(trimmed);
  if (fromNumeric) return fromNumeric;

  // Try name → alpha-2 in each supported locale
  for (const lang of SUPPORTED_LOCALES) {
    const code = countries.getAlpha2Code(trimmed, lang);
    if (code) return code;
  }

  return undefined;
}

/**
 * Get localized country name for an ISO 3166-1 alpha-2 code.
 */
export function getCountryName(code: string, locale: string = "en"): string {
  const lang = SUPPORTED_LOCALES.includes(locale as any) ? locale : "en";
  return countries.getName(code.toUpperCase(), lang) ?? code;
}

/**
 * Validate whether a string is a valid ISO 3166-1 alpha-2 code.
 */
export function isValidCountryCode(code: string): boolean {
  if (!code || typeof code !== "string") return false;
  return countries.isValid(code.toUpperCase());
}
```

- [ ] **Step 3: Verify countries import works**

```bash
cd /home/pascal/projekte/jobsync && node -e "
  const c = require('i18n-iso-countries');
  c.registerLocale(require('i18n-iso-countries/langs/en.json'));
  console.log(c.getName('DE', 'en'));
  console.log(c.getAlpha2Code('Germany', 'en'));
  console.log(c.isValid('DE'));
"
```

Expected: `Germany`, `DE`, `true`

---

### Task 4: GeoCode Module — Layer 2 (Subdivisions)

**Files:**
- Create: `src/lib/connector/reference-data/modules/geo-codes/subdivisions.ts`

- [ ] **Step 1: Create Layer 2 subdivisions wrapper**

Create `src/lib/connector/reference-data/modules/geo-codes/subdivisions.ts`:

```typescript
import iso3166db from "iso3166-2-db";
import type { SubdivisionInfo } from "./types";

const SUPPORTED_LOCALES = ["en", "de", "fr", "es"] as const;

/**
 * Get all subdivisions for a country with localized names.
 * Uses iso3166-2-db (npm) which supports 9 languages including en/de/fr/es.
 * @param countryCode ISO 3166-1 alpha-2 code
 * @param locale ISO 639-1 locale code (default: "en")
 */
export function getSubdivisions(
  countryCode: string,
  locale: string = "en",
): SubdivisionInfo[] {
  const upper = countryCode.toUpperCase();
  const countryData = iso3166db[upper];
  if (!countryData?.sub) return [];

  const lang = SUPPORTED_LOCALES.includes(locale as any) ? locale : "en";

  return Object.entries(countryData.sub)
    .map(([fullCode, sub]) => {
      // fullCode is like "DE-BY", extract just "BY"
      const code = fullCode.startsWith(`${upper}-`)
        ? fullCode.slice(upper.length + 1)
        : fullCode;

      // Localized name: try requested locale, fallback to English, fallback to default name
      const localizedName =
        sub.names?.[lang] ?? sub.names?.en ?? sub.name ?? code;

      return {
        code,
        countryCode: upper,
        name: localizedName,
        subdivisionType: sub.type ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

/**
 * Get a specific subdivision's localized name.
 * @param countryCode ISO 3166-1 alpha-2 ("DE")
 * @param subdivisionCode ISO 3166-2 code without country prefix ("BY")
 * @param locale ISO 639-1 locale code
 */
export function getSubdivisionName(
  countryCode: string,
  subdivisionCode: string,
  locale: string = "en",
): string {
  const upper = countryCode.toUpperCase();
  const fullCode = `${upper}-${subdivisionCode.toUpperCase()}`;
  const countryData = iso3166db[upper];
  const sub = countryData?.sub?.[fullCode];
  if (!sub) return subdivisionCode;

  const lang = SUPPORTED_LOCALES.includes(locale as any) ? locale : "en";
  return sub.names?.[lang] ?? sub.names?.en ?? sub.name ?? subdivisionCode;
}

/**
 * Validate whether a subdivision code exists for a country.
 */
export function isValidSubdivisionCode(
  countryCode: string,
  subdivisionCode: string,
): boolean {
  const upper = countryCode.toUpperCase();
  const fullCode = `${upper}-${subdivisionCode.toUpperCase()}`;
  const countryData = iso3166db[upper];
  return !!countryData?.sub?.[fullCode];
}

/**
 * Check whether a country has any subdivisions in the database.
 */
export function hasSubdivisions(countryCode: string): boolean {
  const countryData = iso3166db[countryCode.toUpperCase()];
  return !!countryData?.sub && Object.keys(countryData.sub).length > 0;
}
```

---

### Task 5: GeoCode Module — NUTS Mapping

**Files:**
- Create: `src/lib/connector/reference-data/modules/geo-codes/nuts-mapping.ts`

- [ ] **Step 1: Create NUTS → ISO 3166-2 crosswalk**

Create `src/lib/connector/reference-data/modules/geo-codes/nuts-mapping.ts`:

```typescript
import type { NutsResolution } from "./types";

/**
 * NUTS Level 1 → ISO 3166-2 crosswalk for EU core countries.
 * Source: Eurostat Correspondence Tables.
 * Key: NUTS L1 code (lowercase), Value: ISO 3166-2 subdivision code (without country prefix).
 *
 * Note: Not all NUTS regions map 1:1 to ISO 3166-2. This covers the main
 * EU countries where NUTS L1 = Bundesland/Region. Best-effort.
 */
const NUTS_TO_ISO: Record<string, string> = {
  // Germany (DE)
  de1: "BW", de2: "BY", de3: "BE", de4: "BB", de5: "HB",
  de6: "HH", de7: "HE", de8: "MV", de9: "NI", dea: "NW",
  deb: "RP", dec: "SL", ded: "SN", dee: "ST", def: "SH", deg: "TH",
  // Austria (AT)
  at1: "1", at2: "2", at3: "3",  // Grouped NUTS, imprecise
  at11: "1", at12: "3", at13: "4", // Burgenland, Niederösterreich, Wien → approx
  at21: "2", at22: "6",           // Kärnten, Steiermark
  at31: "5", at32: "4", at33: "7", at34: "8", // OÖ, Salzburg, Tirol, Vorarlberg
  // France (FR)
  fr1: "IDF", frc: "BFC", frd: "NOR", fre: "HDF",
  frf: "GES", frg: "PDL", frh: "BRE", fri: "NAQ",
  frj: "OCC", frk: "ARA", frl: "PAC", frm: "COR",
  // Belgium (BE)
  be1: "BRU", be2: "VLG", be3: "WAL",
  // Netherlands (NL)
  nl1: "NH", nl2: "GE", nl3: "ZH", nl4: "LI",
  // Italy (IT)
  itc: "25", itf: "72", itg: "82", ith: "32", iti: "52",
  // Spain (ES)
  es1: "GA", es2: "PV", es3: "MD", es4: "CT",
  es5: "VC", es6: "AN", es7: "CN",
  // Poland (PL)
  pl2: "MZ", pl4: "WP", pl5: "DS", pl6: "PM",
  pl7: "LD", pl8: "LU", pl9: "PK",
  // Sweden (SE)
  se1: "AB", se2: "AC", se3: "BD",
  // Portugal (PT)
  pt1: "11", pt2: "20", pt3: "30",
  // Czech Republic (CZ)
  cz0: "10",
  // Ireland (IE)
  ie0: "L",
  // Denmark (DK)
  dk0: "84",
};

/**
 * Extract ISO 3166-1 alpha-2 country code from a NUTS code.
 * Handles the Greece el→GR discrepancy and UK uk→GB.
 */
export function countryFromNuts(nutsCode: string): string | undefined {
  if (!nutsCode || nutsCode.length < 2) return undefined;
  const prefix = nutsCode.slice(0, 2).toLowerCase();

  // EURES/Eurostat uses "el" for Greece, ISO uses "GR"
  if (prefix === "el") return "GR";
  // EURES uses "uk" for United Kingdom, ISO uses "GB"
  if (prefix === "uk") return "GB";

  return prefix.toUpperCase();
}

/**
 * Map a NUTS code to an ISO 3166-2 subdivision code.
 * Best-effort: only NUTS Level 1 for EU core countries.
 * Returns null if no mapping found.
 */
export function nutsToSubdivision(nutsCode: string): string | null {
  if (!nutsCode || nutsCode.length < 3) return null;

  // Try progressively shorter prefixes (NUTS L3 → L2 → L1)
  const lower = nutsCode.toLowerCase();
  for (let len = lower.length; len >= 3; len--) {
    const prefix = lower.slice(0, len);
    if (NUTS_TO_ISO[prefix]) return NUTS_TO_ISO[prefix];
  }

  return null;
}

/**
 * Resolve a NUTS code to both country and subdivision.
 */
export function resolveNutsCode(nutsCode: string): NutsResolution | null {
  const countryCode = countryFromNuts(nutsCode);
  if (!countryCode) return null;

  return {
    countryCode,
    subdivisionCode: nutsToSubdivision(nutsCode),
  };
}
```

---

### Task 6: GeoCode Service + Manifest + i18n + Registration

**Files:**
- Create: `src/lib/connector/reference-data/modules/geo-codes/index.ts`
- Create: `src/lib/connector/reference-data/modules/geo-codes/manifest.ts`
- Create: `src/lib/connector/reference-data/modules/geo-codes/i18n.ts`
- Modify: `src/lib/connector/register-all.ts`

- [ ] **Step 1: Create i18n translations**

Create `src/lib/connector/reference-data/modules/geo-codes/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const geoCodesI18n: ModuleI18n = {
  en: {
    name: "GeoCode Reference Data",
    description: "ISO 3166 country and subdivision code normalization (offline)",
  },
  de: {
    name: "GeoCode-Referenzdaten",
    description: "ISO-3166-Länder- und Verwaltungscode-Normalisierung (offline)",
  },
  fr: {
    name: "Données de référence GeoCode",
    description: "Normalisation des codes pays et subdivisions ISO 3166 (hors ligne)",
  },
  es: {
    name: "Datos de referencia GeoCode",
    description: "Normalización de códigos de país y subdivisión ISO 3166 (sin conexión)",
  },
};
```

- [ ] **Step 2: Create manifest**

Create `src/lib/connector/reference-data/modules/geo-codes/manifest.ts`:

```typescript
import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { ReferenceDataManifest } from "@/lib/connector/manifest";
import { geoCodesI18n } from "./i18n";

export const geoCodesManifest: ReferenceDataManifest = {
  id: "geo_codes",
  name: "GeoCode Reference Data",
  manifestVersion: 1,
  connectorType: ConnectorType.REFERENCE_DATA,
  taxonomy: "geo_codes",
  credential: {
    type: CredentialType.NONE,
    moduleId: "geo_codes",
    required: false,
    sensitive: false,
  },
  // GeoCode is offline-only — no health endpoint to probe
  i18n: geoCodesI18n,
};
```

- [ ] **Step 3: Create GeoCodeService (index.ts)**

Create `src/lib/connector/reference-data/modules/geo-codes/index.ts`:

```typescript
import "server-only";

import type { ReferenceDataConnector } from "../../types";
import { moduleRegistry } from "@/lib/connector/registry";
import { geoCodesManifest } from "./manifest";
import type { CountryInfo, SubdivisionInfo, NutsResolution } from "./types";
import {
  getCountries as getCountriesL1,
  normalizeCountry,
  getCountryName,
  isValidCountryCode,
} from "./countries";
import {
  getSubdivisions as getSubdivisionsL2,
  getSubdivisionName,
  isValidSubdivisionCode,
  hasSubdivisions as hasSubdivisionsL2,
} from "./subdivisions";
import {
  countryFromNuts,
  nutsToSubdivision,
  resolveNutsCode,
} from "./nuts-mapping";

// Re-export types for consumers
export type { CountryInfo, SubdivisionInfo, NutsResolution } from "./types";

const SINGLETON_KEY = Symbol.for("jobsync.geoCodeService");

export interface GeoCodeService {
  getCountries(locale?: string): CountryInfo[];
  getSubdivisions(countryCode: string, locale?: string): SubdivisionInfo[];
  normalizeCountry(input: string): string | undefined;
  getCountryName(code: string, locale?: string): string;
  isValidCountryCode(code: string): boolean;
  isValidSubdivisionCode(countryCode: string, subdivisionCode: string): boolean;
  getSubdivisionName(countryCode: string, subdivisionCode: string, locale?: string): string;
  countryFromNuts(nutsCode: string): string | undefined;
  nutsToSubdivision(nutsCode: string): string | null;
  resolveNutsCode(nutsCode: string): NutsResolution | null;
}

function createGeoCodeService(): GeoCodeService {
  return {
    getCountries(locale = "en"): CountryInfo[] {
      const countries = getCountriesL1(locale);
      // Refine hasSubdivisions using Layer 2 data
      return countries.map((c) => ({
        ...c,
        hasSubdivisions: hasSubdivisionsL2(c.code),
      }));
    },

    getSubdivisions(countryCode: string, locale = "en"): SubdivisionInfo[] {
      return getSubdivisionsL2(countryCode, locale);
    },

    normalizeCountry,
    getCountryName,
    isValidCountryCode,
    isValidSubdivisionCode,
    getSubdivisionName,
    countryFromNuts,
    nutsToSubdivision,
    resolveNutsCode,
  };
}

/** globalThis singleton — survives HMR */
export function getGeoCodeService(): GeoCodeService {
  const g = globalThis as unknown as Record<symbol, GeoCodeService>;
  if (!g[SINGLETON_KEY]) {
    g[SINGLETON_KEY] = createGeoCodeService();
  }
  return g[SINGLETON_KEY];
}

// Module factory for Reference Data Connector registration
function createGeoCodesModule(): ReferenceDataConnector {
  return { id: "geo_codes" };
}

// Self-registration
moduleRegistry.register(geoCodesManifest, createGeoCodesModule);
```

- [ ] **Step 4: Register in register-all.ts**

Add to `src/lib/connector/register-all.ts` in the "Reference Data" section:

```typescript
import "./reference-data/modules/geo-codes";
```

- [ ] **Step 5: Verify module registers correctly**

```bash
cd /home/pascal/projekte/jobsync && source scripts/env.sh && node -e "
  require('./src/lib/connector/register-all');
  const { moduleRegistry } = require('./src/lib/connector/registry');
  const mods = moduleRegistry.getAll();
  console.log('Registered modules:', mods.map(m => m.manifest.id));
" 2>&1 || echo "Check with tsc instead"
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/connector/reference-data/modules/geo-codes/ src/lib/connector/register-all.ts
git commit -m "feat(geo): implement GeoCode Reference Module (ROADMAP 1.21)

Three-layer architecture:
- Layer 1: i18n-iso-countries (78 languages, country normalization)
- Layer 2: iso3166-2-db (9 languages, subdivision lookup)
- NUTS→ISO 3166-2 crosswalk for EU core countries

Implements GeoCodeLookupContract from specs/geo-codes.allium.
globalThis singleton, self-registration via moduleRegistry.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: GeoCode Module Tests

**Files:**
- Create: `__tests__/geo-codes.spec.ts`

- [ ] **Step 1: Write comprehensive tests**

Create `__tests__/geo-codes.spec.ts`:

```typescript
import {
  getGeoCodeService,
  type CountryInfo,
  type SubdivisionInfo,
} from "@/lib/connector/reference-data/modules/geo-codes";

describe("GeoCodeService", () => {
  const geo = getGeoCodeService();

  describe("getCountries", () => {
    it("returns countries with localized names in English", () => {
      const countries = geo.getCountries("en");
      expect(countries.length).toBeGreaterThan(200);
      const de = countries.find((c) => c.code === "DE");
      expect(de).toBeDefined();
      expect(de!.name).toBe("Germany");
      expect(de!.hasSubdivisions).toBe(true);
    });

    it("returns countries with localized names in German", () => {
      const countries = geo.getCountries("de");
      const de = countries.find((c) => c.code === "DE");
      expect(de!.name).toBe("Deutschland");
    });

    it("returns countries with localized names in French", () => {
      const countries = geo.getCountries("fr");
      const fr = countries.find((c) => c.code === "FR");
      expect(fr!.name).toMatch(/France/);
    });

    it("returns countries with localized names in Spanish", () => {
      const countries = geo.getCountries("es");
      const es = countries.find((c) => c.code === "ES");
      expect(es!.name).toMatch(/España/);
    });

    it("falls back to English for unsupported locale", () => {
      const countries = geo.getCountries("zh");
      const de = countries.find((c) => c.code === "DE");
      expect(de!.name).toBe("Germany");
    });

    it("returns sorted by name", () => {
      const countries = geo.getCountries("en");
      const names = countries.map((c) => c.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b, "en"));
      expect(names).toEqual(sorted);
    });
  });

  describe("getSubdivisions", () => {
    it("returns subdivisions for Germany", () => {
      const subs = geo.getSubdivisions("DE", "en");
      expect(subs.length).toBeGreaterThan(10);
      const by = subs.find((s) => s.code === "BY");
      expect(by).toBeDefined();
      expect(by!.name).toMatch(/Bavaria|Bayern/i);
      expect(by!.countryCode).toBe("DE");
    });

    it("returns localized subdivision names in German", () => {
      const subs = geo.getSubdivisions("DE", "de");
      const by = subs.find((s) => s.code === "BY");
      expect(by!.name).toMatch(/Bayern/);
    });

    it("returns empty array for invalid country", () => {
      expect(geo.getSubdivisions("XX")).toEqual([]);
    });

    it("returns subdivisions for US", () => {
      const subs = geo.getSubdivisions("US", "en");
      expect(subs.length).toBeGreaterThan(50);
      const ca = subs.find((s) => s.code === "CA");
      expect(ca!.name).toBe("California");
    });
  });

  describe("normalizeCountry", () => {
    it("normalizes alpha-2 codes", () => {
      expect(geo.normalizeCountry("de")).toBe("DE");
      expect(geo.normalizeCountry("DE")).toBe("DE");
    });

    it("normalizes alpha-3 codes", () => {
      expect(geo.normalizeCountry("DEU")).toBe("DE");
      expect(geo.normalizeCountry("USA")).toBe("US");
    });

    it("normalizes English country names", () => {
      expect(geo.normalizeCountry("Germany")).toBe("DE");
      expect(geo.normalizeCountry("United States")).toBe("US");
    });

    it("normalizes German country names", () => {
      expect(geo.normalizeCountry("Deutschland")).toBe("DE");
      expect(geo.normalizeCountry("Frankreich")).toBe("FR");
    });

    it("normalizes French country names", () => {
      expect(geo.normalizeCountry("Allemagne")).toBe("DE");
    });

    it("normalizes Spanish country names", () => {
      expect(geo.normalizeCountry("Alemania")).toBe("DE");
    });

    it("returns undefined for unrecognizable input", () => {
      expect(geo.normalizeCountry("Narnia")).toBeUndefined();
      expect(geo.normalizeCountry("")).toBeUndefined();
    });

    it("is idempotent", () => {
      const first = geo.normalizeCountry("Germany");
      const second = geo.normalizeCountry(first!);
      expect(first).toBe(second);
    });
  });

  describe("isValidCountryCode", () => {
    it("accepts valid alpha-2 codes", () => {
      expect(geo.isValidCountryCode("DE")).toBe(true);
      expect(geo.isValidCountryCode("US")).toBe(true);
    });

    it("rejects invalid codes", () => {
      expect(geo.isValidCountryCode("XX")).toBe(false);
      expect(geo.isValidCountryCode("")).toBe(false);
    });
  });

  describe("isValidSubdivisionCode", () => {
    it("accepts valid subdivision codes", () => {
      expect(geo.isValidSubdivisionCode("DE", "BY")).toBe(true);
      expect(geo.isValidSubdivisionCode("US", "CA")).toBe(true);
    });

    it("rejects invalid subdivision codes", () => {
      expect(geo.isValidSubdivisionCode("DE", "XX")).toBe(false);
      expect(geo.isValidSubdivisionCode("XX", "BY")).toBe(false);
    });
  });

  describe("NUTS mapping", () => {
    it("extracts country from NUTS code", () => {
      expect(geo.countryFromNuts("de21")).toBe("DE");
      expect(geo.countryFromNuts("fr1")).toBe("FR");
    });

    it("handles Greece el→GR", () => {
      expect(geo.countryFromNuts("el3")).toBe("GR");
    });

    it("handles UK uk→GB", () => {
      expect(geo.countryFromNuts("ukc")).toBe("GB");
    });

    it("maps NUTS L1 to ISO subdivision for Germany", () => {
      expect(geo.nutsToSubdivision("de2")).toBe("BY"); // Bayern
      expect(geo.nutsToSubdivision("de1")).toBe("BW"); // Baden-Württemberg
    });

    it("maps NUTS L1 to ISO subdivision for France", () => {
      expect(geo.nutsToSubdivision("fr1")).toBe("IDF"); // Île-de-France
    });

    it("returns null for unmapped NUTS codes", () => {
      expect(geo.nutsToSubdivision("xx9")).toBeNull();
    });

    it("resolveNutsCode returns both country and subdivision", () => {
      const result = geo.resolveNutsCode("de2");
      expect(result).toEqual({
        countryCode: "DE",
        subdivisionCode: "BY",
      });
    });

    it("resolveNutsCode returns null for invalid input", () => {
      expect(geo.resolveNutsCode("")).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/pascal/projekte/jobsync && bash scripts/test.sh -- --testPathPattern="geo-codes" 2>&1 | tail -30
```

Expected: All tests pass. Some subdivision name assertions may need adjustment based on actual iso3166-2-db data. Fix any failures.

- [ ] **Step 3: Commit**

```bash
git add __tests__/geo-codes.spec.ts
git commit -m "test(geo): add GeoCodeService unit tests

Tests for all 3 layers: countries (localization, normalization),
subdivisions (lookup, validation), NUTS mapping (EU core countries).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: CountrySelect + SubdivisionSelect UI Components

**Files:**
- Create: `src/components/ui/country-select.tsx`
- Create: `src/components/ui/subdivision-select.tsx`
- Modify: `src/i18n/dictionaries/crm.ts`

- [ ] **Step 1: Add i18n keys for country/subdivision select**

In `src/i18n/dictionaries/crm.ts`, add to each locale object:

```typescript
// EN
countrySelect: "Select country...",
countrySearch: "Search countries...",
subdivisionSelect: "Select state/region...",
subdivisionSearch: "Search states/regions...",
noCountryFound: "No country found.",
noSubdivisionFound: "No state/region found.",
subdivision: "State/Region",

// DE
countrySelect: "Land auswählen...",
countrySearch: "Länder suchen...",
subdivisionSelect: "Bundesland/Region auswählen...",
subdivisionSearch: "Bundesländer/Regionen suchen...",
noCountryFound: "Kein Land gefunden.",
noSubdivisionFound: "Kein Bundesland/Region gefunden.",
subdivision: "Bundesland/Region",

// FR
countrySelect: "Sélectionner un pays...",
countrySearch: "Rechercher des pays...",
subdivisionSelect: "Sélectionner un état/région...",
subdivisionSearch: "Rechercher des états/régions...",
noCountryFound: "Aucun pays trouvé.",
noSubdivisionFound: "Aucun état/région trouvé.",
subdivision: "État/Région",

// ES
countrySelect: "Seleccionar país...",
countrySearch: "Buscar países...",
subdivisionSelect: "Seleccionar estado/región...",
subdivisionSearch: "Buscar estados/regiones...",
noCountryFound: "No se encontró ningún país.",
noSubdivisionFound: "No se encontró ningún estado/región.",
subdivision: "Estado/Región",
```

- [ ] **Step 2: Create CountrySelect component**

Create `src/components/ui/country-select.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface CountryOption {
  code: string;
  name: string;
  hasSubdivisions: boolean;
}

interface CountrySelectProps {
  value: string;
  onValueChange: (code: string) => void;
  countries: CountryOption[];
  disabled?: boolean;
  className?: string;
}

function CountryFlag({ code, className }: { code: string; className?: string }) {
  const [hasError, setHasError] = useState(false);
  const lc = code.toLowerCase();

  if (hasError) return null;

  return (
    <Image
      src={`/flags/${lc}.svg`}
      alt={code}
      className={cn("inline-block shrink-0 rounded-sm", className)}
      width={16}
      height={16}
      onError={() => setHasError(true)}
    />
  );
}

export function CountrySelect({
  value,
  onValueChange,
  countries,
  disabled,
  className,
}: CountrySelectProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);

  const selectedCountry = useMemo(
    () => countries.find((c) => c.code === value),
    [countries, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selectedCountry ? (
            <span className="flex items-center gap-2 truncate">
              <CountryFlag code={selectedCountry.code} />
              {selectedCountry.name}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t("crm.countrySelect")}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("crm.countrySearch")} />
          <CommandList>
            <CommandEmpty>{t("crm.noCountryFound")}</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  — {t("crm.countrySelect")}
                </CommandItem>
              )}
              {countries.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.name} ${c.code}`}
                  onSelect={() => {
                    onValueChange(c.code);
                    setOpen(false);
                  }}
                >
                  <CountryFlag code={c.code} className="mr-2" />
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.code === value && (
                    <Check className="ml-2 h-4 w-4 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Create SubdivisionSelect component**

Create `src/components/ui/subdivision-select.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface SubdivisionOption {
  code: string;
  name: string;
  subdivisionType: string | null;
}

interface SubdivisionSelectProps {
  value: string;
  onValueChange: (code: string) => void;
  subdivisions: SubdivisionOption[];
  disabled?: boolean;
  className?: string;
}

export function SubdivisionSelect({
  value,
  onValueChange,
  subdivisions,
  disabled,
  className,
}: SubdivisionSelectProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);

  const selectedSub = useMemo(
    () => subdivisions.find((s) => s.code === value),
    [subdivisions, value],
  );

  if (subdivisions.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selectedSub ? (
            <span className="truncate">{selectedSub.name}</span>
          ) : (
            <span className="text-muted-foreground">
              {t("crm.subdivisionSelect")}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("crm.subdivisionSearch")} />
          <CommandList>
            <CommandEmpty>{t("crm.noSubdivisionFound")}</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  — {t("crm.subdivisionSelect")}
                </CommandItem>
              )}
              {subdivisions.map((s) => (
                <CommandItem
                  key={s.code}
                  value={`${s.name} ${s.code}`}
                  onSelect={() => {
                    onValueChange(s.code);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.code === value && (
                    <Check className="ml-2 h-4 w-4 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/country-select.tsx src/components/ui/subdivision-select.tsx src/i18n/dictionaries/crm.ts
git commit -m "feat(ui): add CountrySelect + SubdivisionSelect combobox components

Single-select Combobox components for ISO 3166-1 countries (with flags)
and ISO 3166-2 subdivisions (cascading). Follow EuresLocationCombobox
pattern: Popover + Command (cmdk), keyboard-searchable.

i18n keys added for all 4 locales (en/de/fr/es).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2: Integration

### Task 9: PersonForm — Replace Country Input with CountrySelect

**Files:**
- Modify: `src/components/crm/PersonForm.tsx`

- [ ] **Step 1: Add server action to fetch country/subdivision data**

The GeoCodeService uses `import "server-only"` — it cannot be imported in client components. Create a server action for the client to call. Add to `src/actions/person.actions.ts`:

```typescript
import { getGeoCodeService } from "@/lib/connector/reference-data/modules/geo-codes";

export async function getCountryOptions(locale: string): Promise<
  Array<{ code: string; name: string; hasSubdivisions: boolean }>
> {
  const geo = getGeoCodeService();
  return geo.getCountries(locale);
}

export async function getSubdivisionOptions(
  countryCode: string,
  locale: string,
): Promise<Array<{ code: string; name: string; subdivisionType: string | null }>> {
  if (!countryCode) return [];
  const geo = getGeoCodeService();
  return geo.getSubdivisions(countryCode, locale);
}
```

- [ ] **Step 2: Update PersonForm to use CountrySelect + SubdivisionSelect**

In `src/components/crm/PersonForm.tsx`:

1. Add imports:
```typescript
import { CountrySelect, type CountryOption } from "@/components/ui/country-select";
import { SubdivisionSelect, type SubdivisionOption } from "@/components/ui/subdivision-select";
import { getCountryOptions, getSubdivisionOptions } from "@/actions/person.actions";
```

2. Add state for structured codes and data:
```typescript
const [addressCountryCode, setAddressCountryCode] = useState(
  (person?.addressCountryCode as string) ?? "",
);
const [addressSubdivisionCode, setAddressSubdivisionCode] = useState(
  (person?.addressSubdivisionCode as string) ?? "",
);
const [countries, setCountries] = useState<CountryOption[]>([]);
const [subdivisions, setSubdivisions] = useState<SubdivisionOption[]>([]);
```

3. Add effects to load data:
```typescript
import { useEffect } from "react";

// Load countries on mount
useEffect(() => {
  getCountryOptions(locale).then(setCountries);
}, [locale]);

// Load subdivisions when country changes
useEffect(() => {
  if (!addressCountryCode) {
    setSubdivisions([]);
    setAddressSubdivisionCode("");
    return;
  }
  getSubdivisionOptions(addressCountryCode, locale).then(setSubdivisions);
}, [addressCountryCode, locale]);
```

Note: `locale` comes from the existing `useTranslations()` hook — destructure it: `const { t, locale } = useTranslations();`

4. In `handleSubmit`, add to the `onSubmit` data:
```typescript
addressCountryCode: addressCountryCode || null,
addressSubdivisionCode: addressSubdivisionCode || null,
```

5. Replace the country `<Input>` in the Address section (line ~466-470) with:
```tsx
{/* Address */}
<div className="space-y-3">
  <Label>{t("crm.address")}</Label>
  <Input
    placeholder={t("crm.street")}
    value={addressStreet}
    onChange={(e) => setAddressStreet(e.target.value)}
  />
  <div className="grid grid-cols-2 gap-3">
    <Input
      placeholder={t("crm.city")}
      value={addressCity}
      onChange={(e) => setAddressCity(e.target.value)}
    />
    <Input
      placeholder={t("crm.postalCode")}
      value={addressPostalCode}
      onChange={(e) => setAddressPostalCode(e.target.value)}
    />
  </div>
  <CountrySelect
    value={addressCountryCode}
    onValueChange={(code) => {
      setAddressCountryCode(code);
      // Also set the free-text country for backward compatibility
      if (code) {
        const c = countries.find((c) => c.code === code);
        setAddressCountry(c?.name ?? code);
      } else {
        setAddressCountry("");
      }
    }}
    countries={countries}
  />
  {subdivisions.length > 0 && (
    <SubdivisionSelect
      value={addressSubdivisionCode}
      onValueChange={setAddressSubdivisionCode}
      subdivisions={subdivisions}
    />
  )}
</div>
```

Keep the old `addressCountry` state and free-text field hidden but synchronized — this preserves backward compatibility while the codebase migrates to structured codes.

- [ ] **Step 3: Commit**

```bash
git add src/components/crm/PersonForm.tsx src/actions/person.actions.ts
git commit -m "feat(crm): replace PersonForm country input with CountrySelect

CountrySelect (single-select Combobox with flags) replaces free-text
country input. SubdivisionSelect appears cascading when country has
subdivisions. Both emit ISO codes stored in new addressCountryCode /
addressSubdivisionCode fields. Free-text addressCountry kept in sync
for backward compatibility.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Promoter Location.country Fix

**Files:**
- Modify: `src/lib/connector/job-discovery/types.ts`
- Modify: `src/lib/connector/job-discovery/modules/eures/index.ts`
- Modify: `src/lib/connector/job-discovery/reference-data.ts`

- [ ] **Step 1: Add countryCode to DiscoveredVacancy**

In `src/lib/connector/job-discovery/types.ts`, add to `DiscoveredVacancy`:

```typescript
/** ISO 3166-1 alpha-2 country code from the source board (e.g. "DE"). */
countryCode?: string;
```

- [ ] **Step 2: Populate countryCode in EURES module**

In `src/lib/connector/job-discovery/modules/eures/index.ts`, find where DiscoveredVacancy is constructed (around line 52-55 where `locationStr` is built). Add:

```typescript
const countryCode = location?.countryCode?.toUpperCase() ?? undefined;
```

Then include it in the returned DiscoveredVacancy object:
```typescript
countryCode,
```

- [ ] **Step 3: Populate Location.country in findOrCreateLocation**

In `src/lib/connector/job-discovery/reference-data.ts`, modify `findOrCreateLocation` to accept an optional `countryCode` parameter:

```typescript
export async function findOrCreateLocation(
  location: string,
  userId: string,
  countryCode?: string,
): Promise<string | null> {
```

When creating a new Location, include the country:
```typescript
const created = await db.location.create({
  data: {
    label: cityName ?? normalizedLabel,
    value: normalized,
    country: countryCode ?? null,
    createdBy: userId,
  },
});
```

When an existing Location has no country but we now have one, update it:
```typescript
if (existing && countryCode && !existing.country) {
  await db.location.update({
    where: { id: existing.id },
    data: { country: countryCode },
  });
}
```

- [ ] **Step 4: Update callers to pass countryCode**

In `src/lib/connector/job-discovery/mapper.ts`, find `findOrCreateLocation(vacancy.location, userId)` and change to:
```typescript
findOrCreateLocation(vacancy.location, userId, vacancy.countryCode)
```

In `src/lib/connector/job-discovery/promoter.ts`, find the `findOrCreateLocation` call and change similarly:
```typescript
findOrCreateLocation(
  input.locationOverride ?? vacancy.location ?? "",
  userId,
  vacancy.countryCode,
),
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/connector/job-discovery/
git commit -m "fix(discovery): populate Location.country from EURES countryCode

Add countryCode to DiscoveredVacancy. EURES module populates it from
the raw vacancy data. findOrCreateLocation sets Location.country on
create and backfills on existing records. Closes gap L3/L4 from
design doc.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3: Holiday Module

### Task 11: Weekend Service

**Files:**
- Create: `src/lib/connector/reference-data/modules/public-holidays/types.ts`
- Create: `src/lib/connector/reference-data/modules/public-holidays/weekend.ts`

- [ ] **Step 1: Create Holiday types**

Create `src/lib/connector/reference-data/modules/public-holidays/types.ts`:

```typescript
/** A single holiday entry */
export interface HolidayEntry {
  /** ISO 8601 date string: "2026-12-25" */
  date: string;
  /** Localized holiday name */
  name: string;
  /** Holiday classification */
  type: HolidayType;
  /** ISO 3166-1 alpha-2 country code */
  country: string;
  /** ISO 3166-2 subdivision code or null for nationwide */
  subdivision: string | null;
  /** 3rd level region code or null */
  region: string | null;
  /** Whether this is a substitute holiday */
  substitute: boolean;
  /** Start timestamp (timezone-aware, can be mid-day for half-day holidays) */
  start: Date;
  /** End timestamp (can span multiple days) */
  end: Date;
}

export type HolidayType = "public" | "bank" | "school" | "optional" | "observance";

/** Options for holiday checks with optional timezone override */
export interface HolidayCheckOptions {
  country: string;
  subdivision?: string;
  region?: string;
  /** Explicit IANA timezone override (e.g. "America/Denver") */
  timezone?: string;
}

/** Business day check result */
export interface BusinessDayResult {
  isBusinessDay: boolean;
  /** Public/bank holidays blocking this day */
  blockingHolidays: HolidayEntry[];
  isWeekend: boolean;
}
```

- [ ] **Step 2: Create Weekend service**

Create `src/lib/connector/reference-data/modules/public-holidays/weekend.ts`:

```typescript
/**
 * Weekend day lookup per country.
 * Primary: Intl.Locale.getWeekInfo() (Node.js 22+, CLDR-backed)
 * Fallback: cldr-core weekData.json (for older Node.js)
 *
 * Returns day numbers: 1=Mon, 2=Tue, ..., 7=Sun (ISO 8601)
 */

// Lazy-loaded fallback data
let cldrWeekData: Record<string, { _weekendStart: string; _weekendEnd: string }> | null = null;

function loadCldrFallback(): Record<string, { _weekendStart: string; _weekendEnd: string }> {
  if (!cldrWeekData) {
    try {
      // cldr-core stores weekend data in supplemental/weekData.json
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const raw = require("cldr-core/supplemental/weekData.json");
      cldrWeekData = raw?.supplemental?.weekData?.weekendStart
        ? buildWeekendMap(raw.supplemental.weekData)
        : {};
    } catch {
      cldrWeekData = {};
    }
  }
  return cldrWeekData;
}

function buildWeekendMap(weekData: any): Record<string, { _weekendStart: string; _weekendEnd: string }> {
  const map: Record<string, { _weekendStart: string; _weekendEnd: string }> = {};

  // weekendStart and weekendEnd are { "day": "territories..." }
  const starts: Record<string, string> = weekData.weekendStart || {};
  const ends: Record<string, string> = weekData.weekendEnd || {};

  for (const [day, territories] of Object.entries(starts)) {
    for (const territory of (territories as string).split(" ")) {
      if (!map[territory]) map[territory] = { _weekendStart: day, _weekendEnd: "sun" };
      map[territory]._weekendStart = day;
    }
  }

  for (const [day, territories] of Object.entries(ends)) {
    for (const territory of (territories as string).split(" ")) {
      if (!map[territory]) map[territory] = { _weekendStart: "sat", _weekendEnd: day };
      map[territory]._weekendEnd = day;
    }
  }

  return map;
}

const DAY_NAME_TO_ISO: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
};

/**
 * Get weekend day numbers for a country.
 * Returns ISO 8601 day numbers: 1=Mon through 7=Sun.
 */
export function getWeekendDays(country: string): number[] {
  const upper = country.toUpperCase();

  // Primary: Intl.Locale.getWeekInfo() (Node.js 22+)
  try {
    const locale = new Intl.Locale(`und-${upper}`);
    // getWeekInfo() returns { weekend: number[] } where 1=Mon...7=Sun
    if (typeof (locale as any).getWeekInfo === "function") {
      const info = (locale as any).getWeekInfo();
      if (info?.weekend && Array.isArray(info.weekend) && info.weekend.length > 0) {
        return info.weekend;
      }
    }
    // Some runtimes expose weekInfo as a property instead of a method
    if ((locale as any).weekInfo?.weekend) {
      return (locale as any).weekInfo.weekend;
    }
  } catch {
    // Fall through to CLDR fallback
  }

  // Fallback: cldr-core weekData.json
  const cldr = loadCldrFallback();
  const entry = cldr[upper] ?? cldr["001"]; // "001" = world default (Sat+Sun)
  if (!entry) return [6, 7]; // Safe default: Saturday + Sunday

  const start = DAY_NAME_TO_ISO[entry._weekendStart] ?? 6;
  const end = DAY_NAME_TO_ISO[entry._weekendEnd] ?? 7;

  // Build range from start to end (wrapping around if needed)
  const days: number[] = [];
  let current = start;
  while (true) {
    days.push(current);
    if (current === end) break;
    current = current === 7 ? 1 : current + 1;
    if (days.length > 7) break; // Safety
  }

  return days;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/connector/reference-data/modules/public-holidays/types.ts src/lib/connector/reference-data/modules/public-holidays/weekend.ts
git commit -m "feat(holiday): add HolidayEntry types + weekend service

Weekend service uses Intl.Locale.getWeekInfo() (Node.js 22+) with
cldr-core weekData.json fallback. Returns ISO 8601 day numbers
(1=Mon...7=Sun) per country. Handles UAE (Sa+Su since 2022),
Iran (Fr only), etc.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: HolidayService with 3-Layer Caching

**Files:**
- Create: `src/lib/connector/reference-data/modules/public-holidays/caching.ts`
- Create: `src/lib/connector/reference-data/modules/public-holidays/index.ts`
- Create: `src/lib/connector/reference-data/modules/public-holidays/manifest.ts`
- Create: `src/lib/connector/reference-data/modules/public-holidays/i18n.ts`
- Modify: `src/lib/connector/register-all.ts`

- [ ] **Step 1: Create i18n**

Create `src/lib/connector/reference-data/modules/public-holidays/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const publicHolidaysI18n: ModuleI18n = {
  en: {
    name: "Public Holidays",
    description: "Holiday lookups for 200+ countries with weekend patterns (offline)",
  },
  de: {
    name: "Feiertage",
    description: "Feiertags-Lookups für 200+ Länder mit Wochenend-Mustern (offline)",
  },
  fr: {
    name: "Jours fériés",
    description: "Recherche de jours fériés pour 200+ pays avec patterns de week-end (hors ligne)",
  },
  es: {
    name: "Días festivos",
    description: "Consulta de días festivos para más de 200 países con patrones de fin de semana (sin conexión)",
  },
};
```

- [ ] **Step 2: Create manifest**

Create `src/lib/connector/reference-data/modules/public-holidays/manifest.ts`:

```typescript
import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { ReferenceDataManifest } from "@/lib/connector/manifest";
import { publicHolidaysI18n } from "./i18n";

export const publicHolidaysManifest: ReferenceDataManifest = {
  id: "public_holidays",
  name: "Public Holidays",
  manifestVersion: 1,
  connectorType: ConnectorType.REFERENCE_DATA,
  taxonomy: "holidays",
  credential: {
    type: CredentialType.NONE,
    moduleId: "public_holidays",
    required: false,
    sensitive: false,
  },
  // Holiday is offline-only — no health endpoint
  i18n: publicHolidaysI18n,
};
```

- [ ] **Step 3: Create caching layer**

Create `src/lib/connector/reference-data/modules/public-holidays/caching.ts`:

```typescript
import type { HolidayEntry } from "./types";

/**
 * 3-Layer Cache for HolidayService:
 * - Layer 1 (Day-Cache): Map<"country.sub:YYYY-MM-DD", HolidayEntry[]>
 * - Layer 2 (Instance-Cache): Map<"country.sub.region", Holidays>
 *   (managed directly in HolidayService via date-holidays instances)
 * - Layer 3 (Pre-Warm): on startup, getHolidays(currentYear) for active countries
 */

export class DayCache {
  private cache = new Map<string, HolidayEntry[]>();

  static buildKey(
    country: string,
    subdivision: string | undefined,
    region: string | undefined,
    date: Date,
  ): string {
    const dateStr = date.toISOString().slice(0, 10);
    const parts = [country.toUpperCase()];
    if (subdivision) parts.push(subdivision);
    if (region) parts.push(region);
    return `${parts.join(".")}:${dateStr}`;
  }

  get(key: string): HolidayEntry[] | undefined {
    return this.cache.get(key);
  }

  set(key: string, entries: HolidayEntry[]): void {
    this.cache.set(key, entries);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export function buildInstanceKey(
  country: string,
  subdivision?: string,
  region?: string,
): string {
  const parts = [country.toUpperCase()];
  if (subdivision) parts.push(subdivision);
  if (region) parts.push(region);
  return parts.join(".");
}
```

- [ ] **Step 4: Create HolidayService**

Create `src/lib/connector/reference-data/modules/public-holidays/index.ts`:

```typescript
import "server-only";

import Holidays from "date-holidays";
import type { ReferenceDataConnector } from "../../types";
import { moduleRegistry } from "@/lib/connector/registry";
import { publicHolidaysManifest } from "./manifest";
import type { HolidayEntry, HolidayType, BusinessDayResult } from "./types";
import { DayCache, buildInstanceKey } from "./caching";
import { getWeekendDays } from "./weekend";

// Re-export types for consumers
export type { HolidayEntry, HolidayType, BusinessDayResult } from "./types";

const SINGLETON_KEY = Symbol.for("jobsync.holidayService");

/** Map date-holidays raw type to our HolidayType */
function mapHolidayType(raw: string): HolidayType {
  switch (raw) {
    case "public": return "public";
    case "bank": return "bank";
    case "school": return "school";
    case "optional": return "optional";
    case "observance": return "observance";
    default: return "observance";
  }
}

function mapToEntries(
  raw: any[],
  country: string,
  subdivision: string | undefined,
  region: string | undefined,
): HolidayEntry[] {
  return raw.map((h) => ({
    date: h.date?.slice(0, 10) ?? "",
    name: h.name ?? "",
    type: mapHolidayType(h.type),
    country,
    subdivision: subdivision ?? null,
    region: region ?? null,
    substitute: h.substitute ?? false,
    start: h.start instanceof Date ? h.start : new Date(h.start),
    end: h.end instanceof Date ? h.end : new Date(h.end),
  }));
}

export interface HolidayService {
  getHolidays(
    country: string,
    year: number,
    subdivision?: string,
    region?: string,
    locale?: string,
  ): HolidayEntry[];

  isHoliday(
    date: Date,
    country: string,
    subdivision?: string,
    region?: string,
    locale?: string,
  ): HolidayEntry[];

  getWeekendDays(country: string): number[];

  isBusinessDay(
    date: Date,
    country: string,
    subdivision?: string,
    region?: string,
    locale?: string,
  ): BusinessDayResult;

  isHolidayBatch(
    date: Date,
    locations: Array<{ country: string; subdivision?: string; region?: string }>,
    locale?: string,
  ): Map<string, HolidayEntry[]>;

  preWarm(countries: string[], year: number): void;

  clearDayCache(): void;
}

function createHolidayService(): HolidayService {
  const instances = new Map<string, Holidays>();
  const dayCache = new DayCache();

  function getOrCreateInstance(
    country: string,
    subdivision?: string,
    region?: string,
    locale?: string,
  ): Holidays {
    const key = buildInstanceKey(country, subdivision, region);
    let h = instances.get(key);
    if (!h) {
      h = new Holidays(
        country,
        subdivision ?? undefined,
        region ?? undefined,
        { languages: [locale ?? "en", "en"] },
      );
      instances.set(key, h);
    }
    return h;
  }

  return {
    getHolidays(country, year, subdivision, region, locale = "en") {
      const h = getOrCreateInstance(country, subdivision, region, locale);
      const raw = h.getHolidays(year) ?? [];
      return mapToEntries(raw, country, subdivision, region);
    },

    isHoliday(date, country, subdivision, region, locale = "en") {
      const cacheKey = DayCache.buildKey(country, subdivision, region, date);
      const cached = dayCache.get(cacheKey);
      if (cached !== undefined) return cached;

      const h = getOrCreateInstance(country, subdivision, region, locale);
      const raw = h.isHoliday(date);
      const result = raw ? mapToEntries(Array.isArray(raw) ? raw : [raw], country, subdivision, region) : [];
      dayCache.set(cacheKey, result);
      return result;
    },

    getWeekendDays,

    isBusinessDay(date, country, subdivision, region, locale = "en") {
      const holidays = this.isHoliday(date, country, subdivision, region, locale);
      const blockingHolidays = holidays.filter(
        (h) => h.type === "public" || h.type === "bank",
      );
      const weekendDays = getWeekendDays(country);
      // Date.getDay(): 0=Sun...6=Sat → convert to ISO: 1=Mon...7=Sun
      const jsDay = date.getDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      const isWeekend = weekendDays.includes(isoDay);

      return {
        isBusinessDay: blockingHolidays.length === 0 && !isWeekend,
        blockingHolidays,
        isWeekend,
      };
    },

    isHolidayBatch(date, locations, locale = "en") {
      const results = new Map<string, HolidayEntry[]>();
      for (const loc of locations) {
        const key = buildInstanceKey(loc.country, loc.subdivision, loc.region);
        if (!results.has(key)) {
          results.set(
            key,
            this.isHoliday(date, loc.country, loc.subdivision, loc.region, locale),
          );
        }
      }
      return results;
    },

    preWarm(countries, year) {
      for (const c of countries) {
        const h = getOrCreateInstance(c);
        h.getHolidays(year); // Warms internal year-cache
      }
      console.log(
        `[holiday] Pre-warmed ${countries.length} countries for ${year}`,
      );
    },

    clearDayCache() {
      dayCache.clear();
    },
  };
}

/** globalThis singleton — survives HMR */
export function getHolidayService(): HolidayService {
  const g = globalThis as unknown as Record<symbol, HolidayService>;
  if (!g[SINGLETON_KEY]) {
    g[SINGLETON_KEY] = createHolidayService();
  }
  return g[SINGLETON_KEY];
}

// Module factory for Reference Data Connector registration
function createPublicHolidaysModule(): ReferenceDataConnector {
  return { id: "public_holidays" };
}

// Self-registration
moduleRegistry.register(publicHolidaysManifest, createPublicHolidaysModule);
```

- [ ] **Step 5: Register in register-all.ts**

Add to `src/lib/connector/register-all.ts` in the "Reference Data" section:

```typescript
import "./reference-data/modules/public-holidays";
```

- [ ] **Step 6: Wire pre-warm in instrumentation.ts**

In `src/instrumentation.ts`, add after the health scheduler start:

```typescript
// Pre-warm holiday service for active countries
const { getHolidayService } = await import(
  "@/lib/connector/reference-data/modules/public-holidays"
);
const holidayService = getHolidayService();
// Default EU countries — will be refined from CRM Person data later
holidayService.preWarm(
  ["DE", "AT", "CH", "FR", "ES", "IT", "NL", "BE", "PL", "SE", "DK", "IE", "PT", "CZ", "GB", "US"],
  new Date().getFullYear(),
);
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/connector/reference-data/modules/public-holidays/ src/lib/connector/register-all.ts src/instrumentation.ts
git commit -m "feat(holiday): implement Holiday Reference Module (ROADMAP 1.22)

HolidayService wraps date-holidays with 3-layer caching:
- Layer 1: Day-cache (keyed by country.sub:date)
- Layer 2: Instance-cache (one Holidays instance per country.sub)
- Layer 3: Pre-warm at startup for EU core countries

Weekend service uses Intl.Locale.getWeekInfo() + cldr-core fallback.
isBusinessDay checks both holidays (public/bank) and country-specific
weekend patterns. Batch lookup deduplicates by location.

globalThis singleton, self-registration, pre-warm in instrumentation.ts.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Holiday Service Tests

**Files:**
- Create: `__tests__/holiday-service.spec.ts`
- Create: `__tests__/weekend-service.spec.ts`

- [ ] **Step 1: Write weekend service tests**

Create `__tests__/weekend-service.spec.ts`:

```typescript
import { getWeekendDays } from "@/lib/connector/reference-data/modules/public-holidays/weekend";

describe("WeekendService", () => {
  it("returns Saturday+Sunday for Germany", () => {
    const days = getWeekendDays("DE");
    expect(days).toContain(6); // Saturday
    expect(days).toContain(7); // Sunday
    expect(days.length).toBe(2);
  });

  it("returns Saturday+Sunday for US", () => {
    const days = getWeekendDays("US");
    expect(days).toContain(6);
    expect(days).toContain(7);
  });

  it("handles case-insensitive input", () => {
    expect(getWeekendDays("de")).toEqual(getWeekendDays("DE"));
  });

  it("returns weekend days for unknown country (defaults to Sat+Sun)", () => {
    const days = getWeekendDays("XX");
    expect(days).toContain(6);
    expect(days).toContain(7);
  });
});
```

- [ ] **Step 2: Write holiday service tests**

Create `__tests__/holiday-service.spec.ts`:

```typescript
import { getHolidayService, type HolidayEntry } from "@/lib/connector/reference-data/modules/public-holidays";

describe("HolidayService", () => {
  const holidays = getHolidayService();

  describe("getHolidays", () => {
    it("returns German holidays for 2026", () => {
      const result = holidays.getHolidays("DE", 2026);
      expect(result.length).toBeGreaterThan(5);

      const christmas = result.find(
        (h) => h.date === "2026-12-25" && h.type === "public",
      );
      expect(christmas).toBeDefined();
      expect(christmas!.name).toMatch(/Christmas|Weihnacht/i);
    });

    it("returns subdivision-specific holidays for Bavaria", () => {
      const result = holidays.getHolidays("DE", 2026, "BY");
      // Heilige Drei Könige (Jan 6) is only in certain German states incl. Bavaria
      const epiphany = result.find((h) => h.date === "2026-01-06");
      expect(epiphany).toBeDefined();
    });

    it("returns localized names in German", () => {
      const result = holidays.getHolidays("DE", 2026, undefined, undefined, "de");
      const newYear = result.find((h) => h.date === "2026-01-01");
      expect(newYear).toBeDefined();
      expect(newYear!.name).toMatch(/Neujahr/i);
    });

    it("returns empty array for invalid country", () => {
      const result = holidays.getHolidays("XX", 2026);
      expect(result).toEqual([]);
    });
  });

  describe("isHoliday", () => {
    it("detects Christmas 2026 in Germany", () => {
      const date = new Date("2026-12-25T12:00:00.000Z");
      const result = holidays.isHoliday(date, "DE");
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((h) => h.type === "public")).toBe(true);
    });

    it("returns empty array for non-holiday", () => {
      const date = new Date("2026-03-04T12:00:00.000Z"); // Random Wednesday
      const result = holidays.isHoliday(date, "DE");
      const publicHolidays = result.filter((h) => h.type === "public");
      expect(publicHolidays).toHaveLength(0);
    });

    it("caches results (second call should be instant)", () => {
      const date = new Date("2026-12-25T12:00:00.000Z");
      holidays.isHoliday(date, "DE"); // Warm cache
      const start = performance.now();
      holidays.isHoliday(date, "DE"); // Should hit cache
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1); // Sub-millisecond
    });
  });

  describe("isBusinessDay", () => {
    it("Saturday is not a business day in Germany", () => {
      const saturday = new Date("2026-01-03T12:00:00.000Z"); // Saturday
      const result = holidays.isBusinessDay(saturday, "DE");
      expect(result.isBusinessDay).toBe(false);
      expect(result.isWeekend).toBe(true);
    });

    it("Christmas 2026 is not a business day", () => {
      const christmas = new Date("2026-12-25T12:00:00.000Z");
      const result = holidays.isBusinessDay(christmas, "DE");
      expect(result.isBusinessDay).toBe(false);
      expect(result.blockingHolidays.length).toBeGreaterThan(0);
    });

    it("normal Wednesday is a business day", () => {
      const wednesday = new Date("2026-03-04T12:00:00.000Z");
      const result = holidays.isBusinessDay(wednesday, "DE");
      expect(result.isBusinessDay).toBe(true);
      expect(result.isWeekend).toBe(false);
      expect(result.blockingHolidays).toHaveLength(0);
    });

    it("observance holidays do NOT block business days", () => {
      // Find an observance-only day
      const allHolidays = holidays.getHolidays("DE", 2026);
      const observance = allHolidays.find(
        (h) => h.type === "observance" && h.date.slice(5, 7) !== "12", // Not December
      );
      if (observance) {
        const date = new Date(`${observance.date}T12:00:00.000Z`);
        const dayOfWeek = date.getDay();
        // Only test if it's a weekday
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          const result = holidays.isBusinessDay(date, "DE");
          // Should still be a business day unless there's also a public holiday
          if (result.blockingHolidays.length === 0) {
            expect(result.isBusinessDay).toBe(true);
          }
        }
      }
    });
  });

  describe("isHolidayBatch", () => {
    it("deduplicates lookups across locations", () => {
      const date = new Date("2026-12-25T12:00:00.000Z");
      const locations = [
        { country: "DE" },
        { country: "DE" }, // Duplicate
        { country: "FR" },
        { country: "US" },
      ];
      const results = holidays.isHolidayBatch(date, locations);
      // Should have 3 unique entries (DE, FR, US)
      expect(results.size).toBe(3);
    });
  });

  describe("preWarm", () => {
    it("pre-warms without error", () => {
      expect(() => {
        holidays.preWarm(["DE", "FR", "US"], 2026);
      }).not.toThrow();
    });
  });

  describe("clearDayCache", () => {
    it("clears cache without error", () => {
      holidays.isHoliday(new Date("2026-12-25T12:00:00.000Z"), "DE");
      expect(() => holidays.clearDayCache()).not.toThrow();
    });
  });

  describe("historical lookups", () => {
    it("supports lookups for past years", () => {
      const result = holidays.getHolidays("DE", 2020);
      expect(result.length).toBeGreaterThan(5);
      const reunification = result.find((h) => h.date === "2020-10-03");
      expect(reunification).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/pascal/projekte/jobsync && bash scripts/test.sh -- --testPathPattern="(holiday-service|weekend-service)" 2>&1 | tail -30
```

Expected: All tests pass. Fix any failures (e.g., adjust holiday name patterns).

- [ ] **Step 3: Run ALL tests**

```bash
cd /home/pascal/projekte/jobsync && bash scripts/test.sh 2>&1 | tail -20
```

Expected: All suites pass.

- [ ] **Step 4: Run build**

First stop the dev server if running:
```bash
cd /home/pascal/projekte/jobsync && bash scripts/stop.sh
```

Then build:
```bash
cd /home/pascal/projekte/jobsync && source scripts/env.sh && bun run build 2>&1 | tail -20
```

Expected: Zero type errors, clean build.

- [ ] **Step 5: Commit**

```bash
git add __tests__/holiday-service.spec.ts __tests__/weekend-service.spec.ts
git commit -m "test(holiday): add HolidayService + WeekendService unit tests

Comprehensive tests: getHolidays (DE 2026, Bavaria, localization),
isHoliday (detection, caching, cache performance), isBusinessDay
(weekend, holiday, observance non-blocking), batch deduplication,
pre-warm, clearDayCache, historical lookups.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4: Wiring + Verification

### Task 14: Allium Spec Updates

**Files:**
- Modify: `specs/crm.allium` — Add country_code + subdivision_code to Address

- [ ] **Step 1: Update CRM spec Address value object**

In `specs/crm.allium`, find the `value Address` block and verify it has:
```
value Address {
    street: String?
    city: String?
    postal_code: String?
    country: String?
    country_code: String?
    subdivision_code: String?
}
```

The `country_code` and `subdivision_code` fields should already exist per the earlier brainstorming session. If not, add them.

- [ ] **Step 2: Run allium check on all specs**

```bash
cd /home/pascal/projekte/jobsync && allium check specs/geo-codes.allium && allium check specs/holiday-reference-data.allium && allium check specs/crm.allium
```

Expected: 0 errors on all three specs.

- [ ] **Step 3: Commit if changes made**

```bash
git add specs/
git commit -m "spec(crm): add country_code + subdivision_code to Address value object

Aligns crm.allium with Prisma migration (addressCountryCode,
addressSubdivisionCode on Person).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Component + Integration Tests

**Files:**
- Create: `__tests__/CountrySelect.spec.tsx`
- Create: `__tests__/promoter-country.spec.ts`

- [ ] **Step 1: Write CountrySelect component tests**

Create `__tests__/CountrySelect.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CountrySelect } from "@/components/ui/country-select";

const mockCountries = [
  { code: "DE", name: "Germany", hasSubdivisions: true },
  { code: "FR", name: "France", hasSubdivisions: true },
  { code: "US", name: "United States", hasSubdivisions: true },
];

jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    t: (key: string) => key,
    locale: "en",
  }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

describe("CountrySelect", () => {
  it("renders placeholder when no value", () => {
    render(
      <CountrySelect
        value=""
        onValueChange={jest.fn()}
        countries={mockCountries}
      />,
    );
    expect(screen.getByText("crm.countrySelect")).toBeInTheDocument();
  });

  it("renders selected country name", () => {
    render(
      <CountrySelect
        value="DE"
        onValueChange={jest.fn()}
        countries={mockCountries}
      />,
    );
    expect(screen.getByText("Germany")).toBeInTheDocument();
  });

  it("calls onValueChange when a country is selected", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <CountrySelect
        value=""
        onValueChange={onChange}
        countries={mockCountries}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("France"));
    expect(onChange).toHaveBeenCalledWith("FR");
  });

  it("renders as disabled when disabled prop is true", () => {
    render(
      <CountrySelect
        value=""
        onValueChange={jest.fn()}
        countries={mockCountries}
        disabled
      />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Write promoter Location.country test**

Create `__tests__/promoter-country.spec.ts`:

```typescript
import { findOrCreateLocation } from "@/lib/connector/job-discovery/reference-data";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    location: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import db from "@/lib/db";
const mockDb = db as jest.Mocked<typeof db>;

describe("findOrCreateLocation with countryCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sets country when creating a new location", async () => {
    (mockDb.location.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.location.create as jest.Mock).mockResolvedValue({
      id: "loc-1",
      country: "DE",
    });

    await findOrCreateLocation("Berlin", "user-1", "DE");

    expect(mockDb.location.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          country: "DE",
        }),
      }),
    );
  });

  it("backfills country on existing location with null country", async () => {
    (mockDb.location.findFirst as jest.Mock).mockResolvedValue({
      id: "loc-1",
      country: null,
    });

    await findOrCreateLocation("Berlin", "user-1", "DE");

    expect(mockDb.location.update).toHaveBeenCalledWith({
      where: { id: "loc-1" },
      data: { country: "DE" },
    });
  });

  it("does not overwrite existing country", async () => {
    (mockDb.location.findFirst as jest.Mock).mockResolvedValue({
      id: "loc-1",
      country: "FR",
    });

    await findOrCreateLocation("Paris", "user-1", "DE");

    expect(mockDb.location.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run new tests**

```bash
cd /home/pascal/projekte/jobsync && bash scripts/test.sh -- --testPathPattern="(CountrySelect|promoter-country)" 2>&1 | tail -30
```

- [ ] **Step 4: Run ALL tests**

```bash
cd /home/pascal/projekte/jobsync && bash scripts/test.sh 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add __tests__/CountrySelect.spec.tsx __tests__/promoter-country.spec.ts
git commit -m "test: add CountrySelect component + promoter Location.country tests

CountrySelect: placeholder, selection, disabled state.
Promoter: country set on create, backfill on existing, no overwrite.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Final Build Verification + Cleanup

- [ ] **Step 1: Stop dev server**

```bash
cd /home/pascal/projekte/jobsync && bash scripts/stop.sh
```

- [ ] **Step 2: Run full test suite**

```bash
cd /home/pascal/projekte/jobsync && bash scripts/test.sh 2>&1 | tail -30
```

Expected: ALL suites pass, 0 failures.

- [ ] **Step 3: Run full build**

```bash
cd /home/pascal/projekte/jobsync && source scripts/env.sh && bun run build 2>&1 | tail -30
```

Expected: Zero type errors.

- [ ] **Step 4: Run dictionary validation**

```bash
cd /home/pascal/projekte/jobsync && bash scripts/test.sh -- --testPathPattern="dictionaries" 2>&1 | tail -20
```

Expected: All 4 locales consistent for new crm.* keys.

---

## Post-Implementation Checklist

After all tasks are complete:

1. **allium:weed** — Run against `specs/geo-codes.allium`, `specs/holiday-reference-data.allium`, `specs/crm.allium`
2. **comprehensive-review:full-review** — Architecture + Security + Performance + Testing + Best Practices
3. **Blind Spot Analysis** — Grep project-wide for patterns that might need updating
4. **Honesty Gate** (PFLICHT vor Push):
   - Shortcuts genommen? Skills übersprungen?
   - Lücken? Docs aktuell?
   - Handoff vollständig?
5. **Memory Update** — `project_roadmap.md`: 1.21 + 1.22 → DONE
