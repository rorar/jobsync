# ADR-034: User home location + preferred currency live on the Profile aggregate

- **Status:** Accepted
- **Date:** 2026-06-01
- **Context:** Welle 2 (Salary + Profil, Kette B), feature F-AJ-06
- **Deciders:** @rorar

## Context

Welle 2 adds the logged-in user's **home location** (ISO 3166-1 country code +
ISO 3166-2 subdivision code) and **preferred currency** (ISO 4217) to their own
profile. The Welle 2 spec said these persist on the *"Person/Profile aggregate"*,
which is underspecified — inspection of the current schema showed:

- `User` — identity only (`email`, `password`). No address/currency.
- `Profile` — only a `resumes` relation (the user's own CV aggregate). No address/currency.
- `UserSettings` — a free-text `settings` JSON blob. No structured address/currency.
- CRM `Person` — *has* structured `addressCountryCode`/`addressSubdivisionCode`
  (schema:977-978), but `Person` is a **CRM contact** (recruiter, hiring manager),
  NOT the logged-in user's own profile. Wrong aggregate.

So there was no existing home for this data, and a decision was required.

Three downstream ROADMAP consumers depend on this data being **structured and
queryable** (not a free-text blob):

- **2.1 Onboarding-Assistent**, Step 2 — collects *"Standort / Heimatadresse →
  Geo-Referenzpunkt für Entfernungsfilter"* and tracks *"Profil ist zu X%
  eingerichtet"*.
- **2.5 Kartenansicht & Entfernungsfilter** — uses the home location as the
  reference point to compute distance to every job (air-line + drive time),
  a 0–200km slider filter, a map, and a JobDeck swipe criterion.
- **4.x Gehaltsvergleich** (Entgeltatlas etc.) — uses the preferred currency to
  display and compare salaries.

## Decision

Add three nullable structured columns to the **`Profile`** model:

```prisma
addressCountryCode     String?  // ISO 3166-1 alpha-2 (e.g. "DE")
addressSubdivisionCode String?  // ISO 3166-2 without country prefix (e.g. "BY")
preferredCurrency      String?  // ISO 4217 (e.g. "EUR")
```

Persist them through the **Profile aggregate Repository** (`profile.actions.ts`)
via a single reusable server action `updateProfilePreferences()` + reader
`getProfilePreferences()`.

### Rationale

- **DDD aggregate boundary:** `Profile` is the user's own profile aggregate.
  Home location + currency are profile data, not authentication identity — so
  they do not belong on `User` (keeps the auth/identity record minimal, a
  security best practice). They are not CRM-contact data, so not on `Person`.
- **Structured > JSON blob:** real columns are validatable at the boundary
  (`/^[A-Z]{2}$/`, `/^[A-Z]{3}$/`), queryable, and resolvable to coordinates via
  the existing GeoCode module — which the Map/distance feature (2.5) needs.
  A `UserSettings.settings` JSON blob would actively block 2.5.
- **Mirrors the existing precedent:** the same field names/shape are already used
  on CRM `Person` (`addressCountryCode`/`addressSubdivisionCode`), keeping the
  ubiquitous language consistent.
- **One writer, many callers:** `updateProfilePreferences()` is deliberately
  standalone (not embedded in form-specific code) so the future Onboarding wizard
  (2.1) and the profile form share a single source of truth for this write.

### Persistence detail

`Profile.userId` is indexed but **not** `@unique`, and `createResumeProfile`
already treats Profile as effectively 1-per-user via `findFirst`-then-create.
`updateProfilePreferences()` follows the same pattern — `findFirst({where:{userId}})`,
then update if present else create — rather than a Prisma `upsert` (which requires
a unique field). This avoids a uniqueness migration on existing data and handles
the lazy-creation case (a user who has never added a résumé has no Profile row yet).

All queries include `userId` (ADR-015). The action validates the three codes at
the boundary (ADR-019 runtime validation; the union/format is erased at runtime)
and rejects unknown currency codes via the CUR module's `isValidCurrencyCode`.

## Consequences

- **Positive:** clean aggregate placement; structured data ready for 2.1 / 2.5 /
  4.x; consistent with CRM Person; single reusable writer.
- **Negative / follow-ups:**
  - `Profile` lacks `createdAt`/`updatedAt` (pre-existing). Not added here to keep
    the migration minimal; a future migration may add them.
  - GDPR: these are user-owned fields on the user's own Profile (deleted via the
    existing account-deletion cascade `User → Profile`). They are NOT third-party
    PII and are not subject to the cloud-AI egress redaction rule (ADR-032).
  - When the home country changes in the UI, the stale subdivision code must be
    cleared (handled in the form, not the schema).

## Alternatives considered

- **`User` model** — rejected: pollutes the auth/identity aggregate with profile
  + preference data.
- **`UserSettings` JSON blob** — rejected: unstructured, unvalidatable, not
  queryable; would block the 2.5 Map/distance feature.
