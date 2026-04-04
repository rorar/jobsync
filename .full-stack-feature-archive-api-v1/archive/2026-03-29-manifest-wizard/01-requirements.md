# Requirements: ROADMAP 2.10 Phase 1 — Manifest-Driven AutomationWizard

## Problem Statement

The AutomationWizard currently hardcodes module-specific UI. EURES gets special comboboxes via `if (jobBoard === "eures")` checks, while other modules get plain text inputs. This creates three concrete problems:

1. **Arbeitsagentur has 4 invisible filters** (umkreis, veroeffentlichtseit, arbeitszeit, befristung) declared in its manifest but never rendered — users cannot configure them.
2. **EURES has 9 unused API parameters** (publicationPeriod, experience level, position offering, working time, education level, sector, EURES flag, required languages, sort order) that the API supports but the wizard doesn't expose.
3. **scheduleFrequency** is stored in the connectorParams JSON blob despite being a system scheduling concern — no module ever reads it.

**The solution is to decouple all hardcoded module knowledge from the wizard and propagate it through the Connector/Module manifest system.** This is achieved via:

- **`connectorParamsSchema`** — each module declares its filter fields as an array in its manifest. The wizard reads the schema and renders dynamically.
- **`searchFieldOverrides`** — modules declare which specialized widgets to use for shared fields (keywords, location). EURES declares `{ field: "keywords", widgetId: "eures-occupation" }`, the wizard looks it up in a widget registry.
- **Widget Registry** — a mapping of `widgetId → React Component`. New modules register widgets there; the wizard doesn't know about them directly.

The wizard becomes a **generic rendering engine** that only consumes manifests. New modules (StepStone, Indeed, etc.) work without wizard code changes.

## Acceptance Criteria

- [ ] Arbeitsagentur automation shows 4 configurable filter fields (umkreis, arbeitszeit, veroeffentlichtseit, befristung) in the wizard
- [ ] EURES automation shows configurable publicationPeriod (replacing hardcoded "LAST_WEEK") + additional API filters
- [ ] EURES ESCO/Location comboboxes work via widget registry (no hardcoded `jobBoard === "eures"` in wizard)
- [ ] JSearch automation shows no extra fields (no schema declared)
- [ ] All filter labels are localized (4 locales: EN, DE, FR, ES)
- [ ] `scheduleFrequency` is a first-class Automation DB field (not in connectorParams JSON)
- [ ] Existing automations continue to work after migration (backward compatible)
- [ ] Wizard is a headless state machine (`useAutomationWizard` hook) + shell adapter (composable for future 2.1 Onboarding embedding)
- [ ] `manifestVersion` and `automationType` fields added to all manifests (future-proofing for 3.8 + 8.7)
- [ ] `connectorParamsSchema` uses Array format (deterministic ordering)
- [ ] All existing tests pass, new tests added for DynamicParamsForm and widget registry
- [ ] Zero hardcoded module checks remain in the wizard (no `if jobBoard === "x"`)

## Scope

### In Scope

- Formalize `ConnectorParamField` type + Array-based `ConnectorParamsSchema`
- `searchFieldOverrides` on `JobDiscoveryManifest` + widget registry
- `DynamicParamsForm` component (renders schema fields as Shadcn components)
- `useAutomationWizard` headless hook + `WizardShell` presenter
- Prisma migration: `scheduleFrequency` → own column
- EURES manifest: 9 new connectorParams from API spec
- Arbeitsagentur manifest: migrate to Array format + i18n keys
- i18n translations for all param labels (4 locales)
- Dynamic `JobBoard` validation (no hardcoded enum)
- `manifestVersion` + `automationType` on all manifests
- Update `params-validator.ts` for array schema
- Extend `ModuleManifestSummary` DTO for client transport

### Out of Scope

- Maintenance Automations (3.8) — future automationType, only the field is added now
- Module SDK (8.7) — third-party module support, only manifestVersion field added now
- Vacancy Pipeline UI changes (0.5) — already partially implemented by another agent
- Full EURES requiredLanguages widget (complex CEFR level picker) — plain text input for now
- NACE sector labels (human-readable sector names for the multiselect) — codes only for now, labels in a follow-up

## Technical Constraints

- Next.js 15 App Router, React 19, Shadcn UI, Prisma (SQLite)
- Server Actions for data fetching (no API routes for manifest transport)
- Existing `ChipList` component for multiselect rendering
- `@/i18n` adapter pattern for translations (useTranslations hook client-side, t() server-side)
- Manifests live in server-only code — must be serialized via `ModuleManifestSummary` DTO
- Build must pass: `source scripts/env.sh && bun run build`
- Tests must pass: `bash scripts/test.sh --no-coverage`

## Technology Stack

- **Frontend:** Next.js 15 (App Router), React 19, Shadcn UI, react-hook-form + Zod
- **Backend:** Next.js Server Actions, Prisma ORM
- **Database:** SQLite (via Prisma)
- **i18n:** Custom dictionary-based adapter (`@/i18n`, `@/i18n/server`)
- **Testing:** Jest + Testing Library
- **Spec:** Allium (`specs/module-lifecycle.allium`)

## Dependencies

- **0.4 Module Lifecycle Manager** — manifests, registry, activation (DONE)
- **0.5 Vacancy Pipeline** — partially implemented (StagedVacancy, runner changes)
- **Shared utilities** — `parseKeywords()`, `parseLocations()` from `src/utils/automation.utils.ts` (DONE)
- **LocationBadge** — `src/components/ui/location-badge.tsx` (DONE)

## Configuration

- Stack: nextjs-prisma-shadcn
- API Style: server-actions
- Complexity: complex

## Plan Reference

Full implementation plan: `/home/pascal/.claude/plans/mossy-wiggling-orbit.md`
