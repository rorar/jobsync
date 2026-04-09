# Stream 3 — Small Cleanups (3 deferred items)

Status: Complete. All 3 tasks implemented, TypeScript clean in owned files, affected tests passing.

## File ownership respected

- `src/components/automations/DiscoveredJobDetail.tsx`
- `src/components/staging/StagingContainer.tsx` (only `handleDeckAction` superlike branch)
- `src/lib/locale.ts` (only the 3 empty catch blocks)
- `src/i18n/dictionaries/automations.ts` (only the new status keys, 4 locales)
- No test files created (`__tests__/DiscoveredJobDetail.spec.tsx`, `__tests__/StagingContainer*.spec.tsx`, `__tests__/locale*.spec.ts` — per prompt, only update if they already exist. None of them do for the targeted components, so no test files were touched beyond running them.)

No notification files, Prisma files, or non-owned components touched.

---

## Task 1 — DiscoveredJobDetail `{job.status}` i18n

### Status keys added

Added 7 new keys per locale (28 total) under `automations.discoveredJob.status.*` in `src/i18n/dictionaries/automations.ts`:

| Key | EN | DE | FR | ES |
|---|---|---|---|---|
| `.staged` | Staged | Vorgemerkt | En attente | En espera |
| `.processing` | Processing | In Bearbeitung | En traitement | Procesando |
| `.ready` | Ready | Bereit | Prêt | Listo |
| `.promoted` | Promoted | Übernommen | Promu | Promovido |
| `.dismissed` | Dismissed | Abgelehnt | Rejeté | Descartado |
| `.archived` | Archived | Archiviert | Archivé | Archivado |
| `.trashed` | Trashed | Im Papierkorb | Dans la corbeille | En la papelera |

File locations:
- EN lines 150-156 (src/i18n/dictionaries/automations.ts)
- DE lines 591-597
- FR lines 1032-1038
- ES lines 1473-1479

Enum source of truth: `src/models/stagedVacancy.model.ts` line 4 declares
`StagedVacancyStatus = "staged" | "processing" | "ready" | "promoted" | "dismissed"`.
Additional keys (`archived`, `trashed`) were included defensively because the
prompt listed them explicitly and because the staging UI tracks these as
categorizations via `archivedAt`/`trashedAt` timestamps. The lookup falls
back to the raw status string if a key is missing, so future enum drift is
handled gracefully.

### Render-site change

`src/components/automations/DiscoveredJobDetail.tsx`:

- Added a `statusLabel` helper (lines 53-61) that computes the translation
  with a raw-status fallback:
  ```typescript
  const statusLabel = (() => {
    if (!job.status) return "";
    const key = `automations.discoveredJob.status.${job.status}`;
    const translated = t(key);
    return translated === key ? job.status : translated;
  })();
  ```
- Replaced `<Badge variant="outline">{job.status}</Badge>` with
  `<Badge variant="outline">{statusLabel}</Badge>` at line 137 (previously
  line 127 in the pre-edit file).

The component already imported `useTranslations` (line 4), so no new imports
were needed. The fallback pattern avoids any `TranslationKey` cast because
`TranslationKey` is already `string` in `src/i18n/dictionaries.ts:653`.

---

## Task 2 — StagingContainer jobId guard

`src/components/staging/StagingContainer.tsx`, `handleDeckAction`, superlike/promote auto-approve branch.

### Exact diff added (after the toast, before the return)

```diff
           if (result.success) {
             toast({ variant: "success", description: t("staging.promoted") });
             reload();
           } else {
             toast({ variant: "destructive", title: t("staging.error"), description: result.message });
           }
+          // Dev diagnostics — surface silent contract drift if the server
+          // action reports success but omits the created jobId. The deck
+          // celebration fly-in relies on createdJobId being populated, so a
+          // drift here would silently break super-like UX without any error.
+          if (result.success && !result.data?.jobId) {
+            console.warn(
+              "[StagingContainer] promoteStagedVacancyToJob succeeded but returned no jobId",
+              { stagedVacancyId: vacancy.id, result },
+            );
+          }
           return { success: result.success, createdJobId: result.data?.jobId };
```

Location: `src/components/staging/StagingContainer.tsx` lines 286-295 (post-edit).
Behavior unchanged — this is pure observability. No toast, no user-visible
output, no different return value.

---

## Task 3 — `src/lib/locale.ts` bare catch blocks

All 3 empty `catch {}` blocks replaced. Observability added; fallback behavior preserved.

### Catch block 1: JSON.parse inside getUserLocale (settings parse)

**Before** (line 28 pre-edit):
```typescript
} catch {}
```

**After** (lines 28-33 post-edit):
```typescript
} catch (error) {
  console.debug(
    "[locale] userSettings.settings JSON parse failed: falling back to default",
    error,
  );
}
```

Context: `settings.settings` is a JSON-encoded string column; parse failure
means a corrupted/legacy entry — fall through to the cookie check.

### Catch block 2: Outer try in getUserLocale (auth/DB/cookie read)

**Before** (line 38 pre-edit):
```typescript
} catch {}
```

**After** (lines 43-48 post-edit):
```typescript
} catch (error) {
  console.debug(
    "[locale] getUserLocale auth/DB/cookie read failed: falling back to default",
    error,
  );
}
```

Context: covers `auth()` throwing, Prisma `findUnique` failing, or `cookies()`
failing inside a non-request scope — all recoverable via the DEFAULT_LOCALE
fallback.

### Catch block 3: Outer try in getLocaleFromCookie

**Before** (line 54 pre-edit):
```typescript
} catch {}
```

**After** (lines 64-69 post-edit):
```typescript
} catch (error) {
  console.debug(
    "[locale] getLocaleFromCookie cookie read failed: falling back to default",
    error,
  );
}
```

Context: client-safe path that only reads the cookie; throws when called
outside a request scope. Fall through to DEFAULT_LOCALE.

All three use `console.debug` (not `warn`/`error`) — these are expected
fallback paths during tests and during pre-auth initialization; we don't
want to pollute logs at a higher level.

---

## Verification

### TypeScript

`npx tsc --noEmit` on all owned files is clean. The only TypeScript error in
the repo is `__tests__/NotificationItem.spec.tsx:76` (`severity` union drift)
which is owned by Stream 1 (notifications) and was pre-existing — NOT
introduced by this stream. Grep-confirmed that no errors mention any of my
owned files (`DiscoveredJobDetail`, `StagingContainer.tsx`, `locale.ts`,
`automations.ts`).

### Tests

`bash scripts/test.sh --no-coverage --workers=1 __tests__/StagingContainerBanner.spec.tsx __tests__/locale-resolution.spec.ts`:

```
Test Suites: 2 passed, 2 total
Tests:       33 passed, 33 total
```

- `StagingContainerBanner.spec.tsx` — 9+ tests exercising `StagingContainer` (the component modified in Task 2). All green.
- `locale-resolution.spec.ts` — 24 tests exercising `src/lib/locale.ts` (the file modified in Task 3). All green.

The `console.debug` output in the test log (from the three new catch blocks)
fires against the existing failure-path tests (mocked DB failure, mocked
auth failure, bad JSON in settings) — which is the desired observability
kicking in. These are logs, not test assertions, and confirm the guards
are working as intended.

`bash scripts/test.sh --no-coverage --workers=1 __tests__/locales.spec.ts`:

```
Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
```

Dictionary loading / locale list untouched and consistent.

### i18n key consistency

Grep confirms exactly 28 occurrences of `automations.discoveredJob.status.`
in `src/i18n/dictionaries/automations.ts` = 7 keys × 4 locales. No locale
was skipped.

### Files not touched

- No notification files (Stream 1 owns them)
- No Prisma / schema files
- No other component or lib file
- No test files created
