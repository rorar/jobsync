# Workflow — JobSync

## TDD Policy: STRICT

**Every feature, bugfix, and refactor MUST include tests. No code ships without coverage.**

Test pyramid (from CLAUDE.md → Testing Requirements):

| Layer | Tool | When |
| --- | --- | --- |
| Unit | Jest + Testing Library | every PR — actions, utils, formatters, hooks |
| Component | Jest + Testing Library | every UI change |
| Integration | Jest | API routes, ActionResult contracts, Prisma (mocked) |
| E2E | Playwright + Chromium | major features, critical paths — at least 1 happy-path |
| Dictionary | bun runtime | every i18n change — key consistency across 4 locales |

- **New feature** → unit + component + ≥1 E2E happy-path.
- **Bug fix** → regression test that reproduces the bug FIRST, then fix.
- **Refactor** → existing tests pass unchanged (or update if return shapes change).
- **New Connector Module** → unit test for translator + integration test for search/getDetails.
- Read `e2e/CONVENTIONS.md` before writing any E2E test.

## Specification-First (Allium)

For complex/domain-heavy features, **write the Allium spec BEFORE implementing**.
Specs in `specs/*.allium` are the single source of truth for domain rules. Use
`allium:elicit` / `allium:tend` to author, `allium:weed` to check spec↔code drift.

## i18n Discipline (4 locales)

Every user-visible string is translated in EN, DE, FR, ES. Add keys to the right
namespace in `src/i18n/dictionaries/`, all 4 locales, then validate. Import only from
`@/i18n` (client) or `@/i18n/server` (server). Use locale-aware formatters — never
hardcoded date/number formats. `throw new Error()` / `result.message` in server actions
MUST use i18n keys, not hardcoded English.

## Commit Strategy: Conventional Commits

`feat(scope):`, `fix(scope):`, `refactor(scope):`, `chore(scope):`, `test(scope):`, etc.
Commit in logical groups, never one big commit. Push only when explicitly asked.
Co-author trailer per repo convention.

## Code Review

Required for non-trivial changes. UI changes: consult ui-design agents
(design-review, create-component, accessibility-audit) + `/responsive-design` BEFORE
implementing; wait for findings, then implement. **Verify agent "fixed" claims against
`git diff`** — never trust consolidated reports without checking diffs.

## Security ADRs (mandatory)

- **ADR-015 (IDOR):** every Prisma read/write includes `userId` in the where clause.
  `findFirst` (with userId) replaces `findUnique`. Chain-traverse for sub-resources.
- **ADR-016 (Credential Defense), ADR-017 (Encryption Salt), ADR-018 (AUTH_SECRET).**
- **ADR-019 (use-server + rate limiting):** functions taking raw `userId` must NOT be
  in `"use server"` files (use `import "server-only"` or re-validate session). Runtime
  membership checks for erased TS union types. Admin actions gate on
  `authorizeAdminAction()` + admin rate limit.
- SSRF validation on every outbound fetch (webhook, SMTP, Ollama, enrichment, logo).
- PII egress redaction via `@/lib/pii` before any cloud-AI transfer.

## Verification Checkpoints

Manual verification after each **phase** completion (Conductor default). Before any
commit: `bash scripts/test.sh` (all pass) + `source scripts/env.sh && bun run build`
(zero type errors). Stop the dev server before tsc/build. Run
`bash scripts/check-notification-writers.sh` when touching notification code.

## DDD Discipline

- Server actions = Repositories (one action file per aggregate). Return `ActionResult<T>`.
- Never modify an aggregate's children from outside its action file.
- Bounded contexts communicate only through shared domain types (`DiscoveredVacancy`).
- New external systems are **Modules** behind existing Connectors — never new Connectors.

## Post-Work Checklist

- User-reported bug → add to `docs/BUGS.md` immediately (before fixing).
- After bugfix → mark fixed in `docs/BUGS.md`, sync counts.
- After architecture change → `/architecture-decision-records` skill (ADR in `docs/adr/`).
- After feature → update README / User Guide / API docs per `docs/documentation-agents.md`.
- Read `docs/NOT-PLANNED.md` before proposing improvements; check deferred-sprint list.

---

## Initialisierung (jede Implement-Session / jeden Track ZUERST)

- **Nachhaltigkeitsprinzip:** Bei Entscheidungen NICHT den einfacheren Weg —
  den nachhaltigsten, fundiertesten, basierend auf **DDD (Domain Driven Design)**
  und **`docs/ROADMAP.md`** besten Weg wählen. Prüfen: macht es Sinn, `/allium`
  zu befragen?
- **Ressourcen / kein Server-Tanking:** Race Conditions vermeiden. Dev-Server
  **stoppen**, bevor `tsc` und/oder `jest` laufen. `tsc`/`jest`
  **ressourcenschonend** (1 Worker + `nice`). Gilt auch für **Sub-Agents**.
- **Explorieren/Planen:** `/understand-chat` + `/understand-domain` zum Codebase-
  Explorieren und VOR Implementierungen — Features planen, Bugs finden/verifizieren.
  (Graph = Hypothese → gegen Code verifizieren, Feeding-Rule.)
- **Specs:** `/allium` zum Erstellen/Anpassen von Specs + Drift-Check NACH
  Implementierung (`allium:weed`).
- **Hard Constraints:** **Kritische Regeln** laden + beachten, als Bestätigung
  schreiben.

## Wrap-Up-Phase (jeder Track als finale Phase)

1. **Blind-Spot-Analyse** (projektweit grepen nach Pattern-Fixes; Adjacent-Lücken).
2. **`/comprehensive-review:full-review`** (Architecture + Security + Performance +
   Testing + Best-Practices; Findings autonom fixen; Agent-Claims gegen `git diff`
   verifizieren).
3. **Honesty-Gate** (voll ausführen — 2 Fragen: Shortcuts/fehlende Skills/Gaps?
   Docs/Handoff?).
4. **Push eigenständig** (autonom, nach Honesty-Gate; Fork `main`, NIE upstream).
5. **Dokumentation-Update** (README / User-Guide / API-Docs / ADR wo nötig).
6. **BACKLOG / BUGS / Memory-Handoff** aktualisieren.

> Hinweis Graph-Refresh: `/understand` inkrementell **1× am Welle-Ende** (vor Push),
> NICHT per-Commit; `autoUpdate` bleibt OFF. Während des Tracks Graph nur LESEN.

---

_Generated by Conductor — distilled from CLAUDE.md. Review and edit as needed._
