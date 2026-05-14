# Session Handoff: Fix ALL Review Findings

## Anweisung

Fixe ALLE Findings aus dem Comprehensive Review der Session 2026-05-14.
Report: `.full-review/05-final-report.md`. 6 Agents, ~30 unique Findings.
Verwende `/full-stack-orchestration:full-stack-feature` für jedes Arbeitspaket.
Nachhaltigkeitsprinzip beachten. Honesty Gate + remember.md am Ende.

**PFLICHT: Flashlight-Analyse VOR jedem Arbeitspaket.** Welcher Code ist betroffen? Welcher Code profitiert? Gibt es Stellen die das Review nicht gefunden hat? Erst nach Flashlight-Ergebnis implementieren.

## Arbeitspakete (nach Priorität)

### AP-1: SEC-05 + T-4 — uploadFile Server Action Fix (HIGH)

**Was:** `uploadFile` in `src/actions/profile.actions.ts:475` ist als Server Action exponiert (`"use server"` Datei). Akzeptiert raw `dir` + `filePath` Strings. ADR-019 Violation.

**Fix:**
1. Move `uploadFile` to `src/lib/upload.ts` with `import "server-only"`
2. Import in `profile.actions.ts` and `resume/route.ts` from new location
3. Add path traversal regression tests: `../` in dir, `../` in filePath, valid path

**Tests schreiben:**
- `dir = "/data/../etc"` → throws "Invalid upload path"
- `filePath = "/data/files/../../etc/passwd"` → throws
- Valid path within dataDir → succeeds
- Mock `getDataDir()` to return known path

### AP-2: F-02/SEC-01/P-01 — Rate-Limiter Migration (MEDIUM, 3× konvergent)

**Was:** `src/lib/auth/auth-rate-limit.ts` + `src/lib/health-rate-limit.ts` noch nicht auf `createSlidingWindowLimiter` migriert. Unbounded memory, kein Cleanup-Timer, kein maxStoreSize.

**Fix:**
1. Migrate `health-rate-limit.ts` → `createSlidingWindowLimiter({ storeKey: "healthCheckRateLimit", ... })`
2. Migrate `auth-rate-limit.ts` → 2× `createSlidingWindowLimiter` (signin: 5/15min, signup: 3/60min)
3. Preserve `getClientIp()` helper (bleibt in auth-rate-limit.ts)
4. Preserve all public API signatures

**Achtung SEC-09:** `getClientIp()` trusts leftmost X-Forwarded-For. Pre-existing. Fix parallel:
- Use rightmost entry (added by trusted proxy) OR document trusted proxy requirement

### AP-3: T-1 — Rate-Limit Factory Tests (HIGH)

**Was:** `src/lib/rate-limit.ts` hat KEINE dedizierten Tests. Wrapper-Tests decken Factory-Features nicht ab.

**Tests erstellen:** `__tests__/rate-limit.spec.ts` (~15 Tests):
- Basic accept/reject (sliding window)
- Window expiry (Date.now mock)
- `maxStoreSize` eviction (LRU approximation)
- Cleanup timer lifecycle (creation, auto-stop when empty)
- `RichRateLimitResult` fields: `remaining`, `limit`, `resetAt`
- Per-call overrides in rich limiter
- `cleanupIntervalMs = 0` disables timer
- `reset()` clears store + timer
- Independent key tracking

### AP-4: T-2 + T-3 — storage.ts + crm-activity-logger Tests (MEDIUM)

**storage.ts Tests** (`__tests__/storage.spec.ts` ~6 Tests):
- `DATA_DIR` env var priority (jest.isolateModules + process.env)
- `getStoragePath("a", "b")` → `{dataDir}/a/b`
- Convenience exports return expected suffixes
- `getDataDir()` returns absolute path

**crm-activity-logger Tests** (`__tests__/crm-activity-logger.spec.ts` ~8 Tests):
- Mock eventBus.subscribe to capture handlers
- Valid payload → prisma.crmActivityLog.create called with correct activityType
- Invalid payload → safeParsePayload returns null, no create
- Error in create → caught and logged, no throw
- Async projection (ContactCreated) → DB lookup + create
- At least 3 projections tested (sync, async, error)

### AP-5: Batch LOW Fixes (1 Commit)

| ID | Fix | Effort |
|----|-----|--------|
| SEC-10/BP-4 | Add `import "server-only"` to `src/lib/api/rate-limit.ts` | 1 Zeile |
| F-08 | Remove unused `getErrorCount` import in `ErrorLogSettings.tsx` | 1 Zeile |
| BP-2 | `import type { z }` → `import type { ZodType }` in crm-activity-logger.ts | 1 Zeile |
| F-05/BP-1 | `require("fs")` → `import { statSync }` in storage.ts | 2 Zeilen |
| F-01 | Remove redundant local `RateLimitResult` in api/rate-limit.ts, re-export `RichRateLimitResult` | 5 Zeilen |
| F-03 | Replace `stripTokenFromUrl` → `stripCredentialsFromUrl` in logo-asset-service.ts | 1 Zeile |
| F-07 | Add parentheses for clarity in retention-cron.ts globalThis cast | 2 Zeilen |
| A-1 | Wrap re-thrown error in orphan-finder.ts with file path context | 2 Zeilen |
| F-04/SEC-02 | Distinguish ENOENT/ENOTEMPTY from other errors in file-cleanup.ts catch | 5 Zeilen |

### AP-6: Moderate LOW Fixes (separate Commits)

| ID | Fix | Effort |
|----|-----|--------|
| F-10/SEC-03 | Wrap async handler in AiSettings.tsx with .catch() | 10 Zeilen |
| F-09 | Add runtime AiModuleId guard in AiSettings.tsx onValueChange | 3 Zeilen |
| F-11/BP-3 | Move `makeMockChannel` from testFixtures.ts to `__tests__/helpers/mock-channel.ts` | 15 Zeilen |
| F-06/P-02 | Fix rich limiter cleanup to use `Math.max(defaultWindowMs, windowMs)` | 1 Zeile |

### Architektur-Notizen (kein Fix, kein NOT-PLANNED)

| ID | Entscheidung | Trigger für Neubewertung |
|----|-------------|--------------------------|
| R-1 | OverridableRateLimitStrategy ist bewusst KEIN Subtype von RateLimitStrategy | Wenn polymorphe Limiter-Collection benötigt wird (z.B. unified Health Reporting) |
| E-1 | registerProjection ist bewusst module-private | Wenn ein zweiter Projection-Consumer entsteht (z.B. Audit, Analytics) |

## Verification

- `bash scripts/test.sh` nach jedem AP
- `source scripts/env.sh && npx tsc --noEmit` nach jedem AP
- Honesty Gate nach AP-6
- remember.md aktualisieren (NUR appenden, NICHTS löschen)
- `/comprehensive-review:full-review` ist bereits gelaufen — nicht nochmal nötig

## Kontext-Dateien

- `.full-review/05-final-report.md` — vollständiger Report
- `.full-review/01-quality-architecture.md` — Code Quality + Architecture Details
- `.full-review/02-security-performance.md` — Security + Performance Details
- `.full-review/03-testing-documentation.md` — Test Coverage Details
- `.full-review/04-best-practices.md` — Framework Best Practices Details
- `CLAUDE.md` — Projekt-Guidelines (ADR-019, IDOR, "use server" Rules)
- `docs/NOT-PLANNED.md` — Bewusst abgelehnte Items
