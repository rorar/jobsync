# Requirements: Fix 7 Blind-Spot Items

## Problem Statement
Self-review after ROADMAP 0.2-0.5 implementation revealed 7 gaps: stale documentation, missing i18n, incomplete prop handling, missing component tests, fragile parsing, and data pollution from E2E tests.

## Acceptance Criteria
- [ ] DEADLOCKS.md updated (Chrome DevTools MCP available)
- [ ] LocationBadge passes `resolve={false}` for non-EURES boards
- [ ] performanceWarning parsing never shows raw prefix string to user
- [ ] AddExperience.tsx: 0 hardcoded English strings
- [ ] AddEducation.tsx: 0 hardcoded English strings
- [ ] AddResumeSummary.tsx: 0 hardcoded English strings
- [ ] All new i18n keys in 4 locales (en/de/fr/es)
- [ ] "Clear E2E Test Data" button in Developer Settings
- [ ] ESCO Combobox custom-keyword Enter flow verified
- [ ] LocationBadge component test exists
- [ ] AutomationSettings component test exists
- [ ] SSE logs route test exists
- [ ] Build: 0 TypeScript errors
- [ ] Tests: all passing
- [ ] CI: green

## Scope
### In Scope
- Quick fixes (DEADLOCKS, LocationBadge, performanceWarning)
- i18n for 3 profile modal components
- E2E test data cleanup mechanism
- Component tests for recent additions

### Out of Scope
- New features (ROADMAP 0.6+)
- Refactoring existing tests
- UI redesign

## Technical Constraints
- Next.js 15, Prisma (SQLite), Shadcn UI, Jest + Testing Library
- i18n uses adapter pattern from @/i18n
- Tests follow Jest patterns in __tests__/
- 4 locales: en, de, fr, es

## Technology Stack
- Frontend: Next.js 15 (App Router), React 19, Shadcn UI, Tailwind
- Backend: Next.js Server Actions, Prisma ORM
- Database: SQLite
- Testing: Jest, React Testing Library, Playwright (E2E)

## Dependencies
- LocationBadge depends on getLocationLabel/getCountryCode from EURES countries module
- E2E cleanup follows mock.actions.ts pattern
- Component tests follow existing __tests__/*.spec.tsx patterns

## Phases
1. Quick Fixes (parallel, no deps): DEADLOCKS, LocationBadge, performanceWarning
2. i18n (parallel per file): AddExperience, AddEducation, AddResumeSummary + dictionary
3. E2E Cleanup + ESCO Verification
4. Component Tests: LocationBadge, AutomationSettings, SSE logs
