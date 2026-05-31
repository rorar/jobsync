# Sprint C Track 3: Public API v1 Foundation (ROADMAP 7.1 Phase 1)

## Paste this as the first message in a new Claude Code session:

```
Lies CLAUDE.md und die Projekt-Memories zuerst. Dann lies docs/ROADMAP.md Sektion 7.1 + 6.2.

## Kontext
ROADMAP 0.10 (Scheduler Coordination) + Sprint A + Sprint B sind DONE (auf main).
Sprint C Track 1 (Blacklist+Caching) und Track 2 (JobDeck) sind auf Feature-Branches fertig.
Du implementierst Track 3: Public API v1.

Lies den Masterplan: /home/pascal/.claude/plans/open-architecture-masterplan.md (Sektion C2).

## Dein Auftrag: Public API v1 Foundation (ROADMAP 7.1 Phase 1)

REST API als "Open Host Service" (DDD) — manuell designte Surface über bestehenden Server Actions.

Verwende /full-stack-orchestration:full-stack-feature für die Implementierung.
Bei Checkpoints: Approve automatisch und mache weiter (du arbeitest autonom).

### Was zu bauen ist:

**1. PublicApiKey Model + Migration**
- Neues Prisma Model PublicApiKey (id, userId, name, keyHash, keyPrefix, permissions, lastUsedAt, createdAt)
- SHA-256 Hash für Key-Speicherung (NICHT AES wie Module-Keys — API Keys müssen schnell validierbar sein)
- keyPrefix für Display: "pk_live_abc1" (erste 12 Zeichen sichtbar)
- Getrennt vom bestehenden ApiKey Model (das ist für Module-Credentials)

**2. API Key Auth Middleware**
- src/lib/api/auth.ts — validateApiKey(req): extracts key from Authorization: Bearer oder X-API-Key Header
- Lookup: Hash den empfangenen Key → suche in PublicApiKey.keyHash
- Return: userId des Key-Owners (für getCurrentUser()-Bridge)
- Rate Limiting: In-Memory Sliding Window 60 req/min pro API Key

**3. ActionResult→HTTP Bridge**
- src/lib/api/response.ts — Hilfsfunktionen:
  - actionToResponse(result: ActionResult<T>) → NextResponse mit richtigem HTTP Status
  - paginatedResponse(data, total, page, perPage) → { success: true, data, meta: { total, page, perPage } }
  - errorResponse(code, message, status) → { success: false, error: { code, message } }
- HTTP Status Mapping: success=200, not_found=404, validation=400, auth=401, server=500

**4. API Route Handlers (Phase 1 — Jobs only)**
```
src/app/api/v1/
  jobs/
    route.ts          — GET (list with pagination) + POST (create)
    [id]/
      route.ts        — GET (single) + PATCH (update) + DELETE
      notes/
        route.ts      — GET (list notes) + POST (add note)
```
- Thin wrappers über bestehende Server Actions aus src/actions/job.actions.ts
- Input Validation mit Zod (zod ist bereits als Dependency vorhanden)
- Pagination: ?page=1&perPage=25 (Defaults aus APP_CONSTANTS)

**5. Middleware Update**
- src/middleware.ts erweitern: /api/v1/* Pfade NICHT durch NextAuth Session-Check leiten
- Stattdessen: API Key Check in den Route Handlers selbst (oder in einem shared wrapper)
- /api/* (intern, Frontend) bleibt bei Session-Auth

**6. API Key Management UI**
- src/components/settings/PublicApiKeySettings.tsx
- Key erstellen (Name eingeben → Key wird einmalig angezeigt → danach nur noch Prefix sichtbar)
- Keys auflisten (Name, Prefix, lastUsedAt, erstellt am)
- Key widerrufen (Soft-Delete oder Hard-Delete)

**7. Tests**
- Integration Tests für jeden Endpoint (Auth, Success, Validation, 404)
- Unit Tests für API Key Auth (valid, invalid, expired, rate-limited)
- Unit Tests für ActionResult→HTTP Bridge

### Bestehende Infrastruktur die du NUTZEN sollst:
- src/actions/job.actions.ts — getJobs, getJobById, createJob, updateJob, deleteJobById, addNote
- src/models/actionResult.ts — ActionResult<T> Type
- src/lib/encryption.ts — encrypt/decrypt/getLast4 (für Key-Generierung referenz, aber API Keys brauchen SHA-256 nicht AES)
- src/utils/user.utils.ts — getCurrentUser()
- src/lib/constants.ts — APP_CONSTANTS.RECORDS_PER_PAGE
- prisma/schema.prisma — User Model (Relation hinzufügen)

### Architektur-Entscheidungen (bereits getroffen):
- REST, nicht GraphQL
- API Keys, nicht OAuth (Self-Hosted App)
- Manuell designte Surface, nicht Prisma-Auto-Gen
- Zod Validation auf allen Inputs
- Aggregate-Grenzen respektieren: Jobs Endpoints greifen NUR auf job.actions.ts zu
- keyHash = SHA-256 (schneller Lookup), NICHT AES Encryption (das ist für Module-Secrets)
- AsyncLocalStorage für User-Context-Bridge ist OPTIONAL Phase 2 — Phase 1 kann userId direkt aus dem Key-Lookup verwenden

### Parallel Track Safety Rules:
- i18n: Erstelle NEUE Datei src/i18n/dictionaries/api.ts für ALLE API-Keys. NICHT automations.ts oder settings.ts ändern.
- Prisma: schema.prisma ändern (PublicApiKey Model), aber NICHT prisma migrate dev ausführen. Migration läuft auf main nach Merge.
- Dependency: zod ist bereits installiert. Falls weitere Packages nötig (z.B. uuid für Key-Gen): bun add und package.json + bun.lockb committen.
- Merge-Reihenfolge: Dieser Track mergt ZUERST (vor Blacklist und JobDeck).

### File Ownership:
- src/app/api/v1/ (NEUES Verzeichnis — alle Routes)
- src/lib/api/ (NEU — Key Validation, Rate Limiting, Response Helpers)
- src/middleware.ts (MODIFY — /api/v1/* ausschließen von Session-Auth)
- src/components/settings/PublicApiKeySettings.tsx (NEU)
- src/actions/publicApiKey.actions.ts (NEU — CRUD für API Keys)
- src/models/publicApiKey.model.ts (NEU — Types)
- src/i18n/dictionaries/api.ts (NEU — eigener Namespace)
- prisma/schema.prisma (PublicApiKey Model hinzufügen)
- __tests__/public-api-*.spec.ts (NEU — Tests)
- NICHT ändern: src/lib/scheduler/*, src/components/staging/*, src/hooks/*, src/i18n/dictionaries/automations.ts

### PDCA-Zyklus:
- PLAN: Lies ROADMAP 7.1 + 6.2, prüfe Cross-Dependencies, konsultiere Allium wenn Domain-Regeln betroffen
- DO: Implementiere mit /full-stack-orchestration:full-stack-feature, committe nach jedem Schritt
- CHECK: Nach jeder Phase /comprehensive-review:full-review, Blind Spot Check "Woran haben wir nicht gedacht?"
- ACT: Fixe Findings, aktualisiere CLAUDE.md/ROADMAP/ADR, erweitere Tests

Git: Committe HÄUFIG (nach jedem logischen Schritt), konventionelle Commits mit Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
Build + Tests VOR jedem Commit: source scripts/env.sh && bun run build && bash scripts/test.sh --no-coverage
```
