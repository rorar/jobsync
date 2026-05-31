# EURES API — Felder die in der OpenAPI Spec gefehlt haben

> **Status: RESOLVED** — Alle Felder wurden in der OpenAPI Spec ergänzt und durch Live-Daten-Sampling verifiziert.
> Detail-Endpoint ist `/jv-searchengine/public/jv/id/{id}` (nicht `/jvs/detail` — gibt 404).

---

## Gehalt & Vergütung

| Feld | Typ | Beispiel |
|------|-----|---------|
| `offeredRemunerationPackage.description` | string | "Competitive salary with benefits" |
| `offeredRemunerationPackage.remunerationBasisCode` | string | "salaried" |
| `offeredRemunerationPackage.salaries[].minimumSalary` | number | 30000 |
| `offeredRemunerationPackage.salaries[].maximumSalary` | number | 45000 |
| `offeredRemunerationPackage.salaries[].currencyCode` | string (ISO 4217) | "EUR" |
| `offeredRemunerationPackage.salaries[].payingIntervalCode` | string | ~~"monthly"~~ → **"month"** (korrigiert) |
| `offeredRemunerationPackage.salaries[].remunerationTypeCode` | string | "basepay", **"commission"** (neu entdeckt) |
| `offeredRemunerationPackage.benefitsSummaries[]` | string[] | ["Health insurance", "401k"] |

## Anforderungen

| Feld | Typ | Beispiel |
|------|-----|---------|
| `requiredEducationLevelCode` | enum | "bachelor" / "master" / "doctoral" |
| `requiredQualificationLevelCode` | string | "5" (EQF-Stufe) |
| `requiredExperiences[].categoryCode` | string | ESCO Occupation URI |
| `requiredExperiences[].measure.value` | number | 3 |
| `requiredExperiences[].measure.unitCode` | string | "year" |
| `requiredExperiences[].description` | string | "3 years Java experience" |
| `requiredYearsOfExperience` | number | 3 |
| `requiredSkills[]` | string[] | ESCO Skill URIs |
| `requiredDrivingLicenses[]` | string[] | ["B", "C"] |

## Sprachen & Arbeitsort

| Feld | Typ (korrigiert) | Beschreibung |
|------|-------------------|-------------|
| `workingLanguageCodes[]` | string[] (ISO 639-1) | ["de", "en"] |
| `positionLanguages[]` | **PositionLanguage[]** | Vollständiges Schema: `languageCode`, `requiredSkillLevel`, `desiredSkillLevel`, ESCO URIs |
| `travelPreference` | **TravelPreference object** | ~~string~~ → `{willingToTravelIndicator, travelPercentage, description}` |

## Vertragsdaten

| Feld | Typ | Beispiel |
|------|-----|---------|
| `employmentPeriod.startDate` | int64 (Unix ms) | 1770076800000 |
| `employmentPeriod.startDateText` | string | "03 February 2026" |
| `employmentPeriod.endDate` | int64 (Unix ms) | null |
| `employmentPeriod.endDateText` | string | "31 December 2026" |
| `employmentPeriod.periodDescription` | string | "6-month contract" |
| `immediateStartIndicator` | boolean | true |

## Kontakt

| Feld (korrigiert) | Typ | Beschreibung |
|-------------------|-----|-------------|
| `personContacts[]` | **PersonContact[]** | Vollständiges Schema mit `givenName`, `familyName`, verschachtelte `Communications` |
| `personContacts[].communications.addresses[]` | Address[] | Postalische Adressen |
| `personContacts[].communications.phones[]` | Phone[] | Telefonnummern |
| `personContacts[].communications.emails[]` | Email[] | E-Mail-Adressen |

## Adresse

| Feld (neu entdeckt) | Typ | Beschreibung |
|---------------------|-----|-------------|
| `buildingAddress` | **BuildingAddress object** | ~~string~~ → `{buildingNumber, streetName, unit}` |

---

## Korrekturen durch Live-Daten-Sampling

| Feld | Vorher | Nachher |
|------|--------|---------|
| `travelPreference` | `string \| null` | Object: `{willingToTravelIndicator, travelPercentage, description}` |
| `personContacts[]` | Untypisiert | Vollständiges `PersonContact` Schema mit verschachtelten `Communications` |
| `positionLanguages[]` | Untypisiert | `PositionLanguage` mit `requiredSkillLevel`, `desiredSkillLevel`, `languageCode`, ESCO URIs |
| `buildingAddress` | `string \| null` | Object: `BuildingAddress` mit `buildingNumber`, `streetName`, `unit` |
| `Salary.payingIntervalCode` | Beispiel "monthly" | Korrigiert zu "month" (beobachteter Wert) |
| `Salary.remunerationTypeCode` | Nur "basepay" | "commission" als weiterer Wert hinzugefügt |
| Detail-Endpoint | `/jvs/detail` | **`/jv/id/{id}`** (alter Pfad gibt 404) |

---

## Kontext

- **Repo:** https://github.com/rorar/EURES-API-Documentation
- **Betroffenes Schema:** `JobVacancyProfile` (Detail-Endpoint Response)
- **JobSync Impact:** `generated.ts` muss aus der aktualisierten Spec neu generiert werden, dann können die 10 verbleibenden `DiscoveredVacancy`-Felder im EURES Translator gemappt werden
- **Datum:** 2026-04-08
