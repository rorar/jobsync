# Stream B Result — Badge i18n + Stretch Behavior (task 6)

## Summary

The primary user complaint ("badges should respect word length and stretch to the text size if needed") is fixed by a single-line change to the base Badge component: added `whitespace-nowrap` to the CVA base classes. Badges now grow to fit their content instead of wrapping awkwardly when German/French/Spanish translations are longer than the English originals.

Plus: fixed Kanban tag clipping, bumped a few too-small (`text-[10px]`) settings badges to `text-xs`, and removed hardcoded English strings in ErrorLogSettings.tsx.

## Files Modified

1. `/home/pascal/projekte/jobsync/src/components/ui/badge.tsx` — PRIMARY FIX: added `whitespace-nowrap` to base class list.
2. `/home/pascal/projekte/jobsync/src/components/kanban/KanbanCard.tsx` — increased tag `max-w-[80px]` → `max-w-[140px]`, added `title={tag.label}` tooltip for full text on hover.
3. `/home/pascal/projekte/jobsync/src/components/kanban/KanbanColumn.tsx` — verified only (not modified). Both Badges contain pure numeric `{jobs.length}`, so `min-w-[20px]` is safe and correct.
4. `/home/pascal/projekte/jobsync/src/components/settings/ApiStatusOverview.tsx` — bumped the two `text-[10px] px-1.5 py-0 shrink-0` badges (`noCredentialRequired`, `moduleInactive`) to `text-xs px-2 py-0.5 shrink-0` for accessibility and text-fit.
5. `/home/pascal/projekte/jobsync/src/components/settings/ErrorLogSettings.tsx` — replaced `getSourceLabel()` hardcoded English strings with `t(...)` lookups, bumped the source Badge from `text-[10px] px-1.5 py-0` to `text-xs px-2 py-0.5`, translated "Component Stack:" literal, translated "{N} errors" count header.
6. `/home/pascal/projekte/jobsync/src/i18n/dictionaries/settings.ts` — added 6 new keys in all 4 locales.

## New i18n Keys Added

All 6 keys added to `settings.ts` in all 4 locales (`en`, `de`, `fr`, `es` → 24 entries total):

| Key | EN | DE | FR | ES |
|---|---|---|---|---|
| `settings.errorSourceBoundary` | "Error Boundary" | "Error Boundary" | "Error Boundary" | "Error Boundary" |
| `settings.errorSourceUnhandled` | "Unhandled Rejection" | "Unbehandelte Ablehnung" | "Rejet non géré" | "Rechazo no manejado" |
| `settings.errorSourceConsole` | "Console Error" | "Konsolenfehler" | "Erreur console" | "Error de consola" |
| `settings.errorCountOne` | "{count} error" | "{count} Fehler" | "{count} erreur" | "{count} error" |
| `settings.errorCountMany` | "{count} errors" | "{count} Fehler" | "{count} erreurs" | "{count} errores" |
| `settings.errorComponentStack` | "Component Stack:" | "Komponenten-Stack:" | "Pile de composants :" | "Pila de componentes:" |

Note: `Error Boundary` is kept as a technical term across all locales (it is a React-specific proper noun that developers recognize internationally; translating it would hurt discoverability in error reports).

## Hardcoded Badge Strings Found + Fixed

| File:Line | Before | After |
|---|---|---|
| `src/components/settings/ErrorLogSettings.tsx:165` | `return "Error Boundary";` | `return t("settings.errorSourceBoundary");` |
| `src/components/settings/ErrorLogSettings.tsx:167` | `return "Unhandled Rejection";` | `return t("settings.errorSourceUnhandled");` |
| `src/components/settings/ErrorLogSettings.tsx:169` | `return "Console Error";` | `return t("settings.errorSourceConsole");` |
| `src/components/settings/ErrorLogSettings.tsx:224` | `` `${errors.length} ${errors.length === 1 ? "error" : "errors"}` `` | `` (one ? t("settings.errorCountOne") : t("settings.errorCountMany")).replace("{count}", ...) `` |
| `src/components/settings/ErrorLogSettings.tsx:305` | `Component Stack:` | `{t("settings.errorComponentStack")}` |

## Badge Content Audit Notes (not fixed — out of scope)

The following Badges render dynamic AI output and are NOT hardcoded UI strings (they come from an AI model's JSON response — translating them would mean translating model output, which is a separate AI-prompting concern):

- `src/components/profile/AiJobMatchResponseContent.tsx:54` — `{recommendation}` (AI field: "strong match", "good match", etc.)
- `src/components/profile/AiJobMatchResponseContent.tsx:117` — `{req.importance}` (AI field)
- `src/components/automations/MatchDetails.tsx:39` — `{matchData.recommendation}` (AI field)
- `src/components/automations/MatchDetails.tsx:112` — `{req.importance}` (AI field)
- `src/components/automations/DiscoveredJobsList.tsx:187` — `{job.status}` (DB value, English enum)

The following Badges contain hardcoded English but are in files NOT in my ownership list (I did not touch them per ownership protocol):

- `src/components/automations/DiscoveredJobDetail.tsx:122` — `{job.matchScore}% Match` (hardcoded " Match" suffix). File ownership unclear; leaving for team lead decision. This file has broader untranslated text ("Description", "from", "N/A") that needs a full i18n pass outside this stream.
- `src/components/profile/AiJobMatchResponseContent.tsx` — several `<SectionHeader title="Summary" />` calls (not Badge content, not in scope).

All staging components (StagingContainer, StagedVacancyCard, DeckCard, DeckView) were intentionally skipped per ownership protocol — those belong to Streams C/D/F.

## Kanban Clipping Fixes Applied

1. **KanbanCard.tsx tag badges** — `max-w-[80px] truncate` → `max-w-[140px] truncate` with `title={tag.label}` tooltip. Gives German/French tags 75% more room while keeping a safety truncate for extreme 30+ character tags. Hover reveals the full text.
2. **KanbanCard.tsx other badges** (match score, overdue, due today, due soon) — no max-width constraint. With `whitespace-nowrap` now in the base Badge class, they automatically grow to fit translated content.
3. **KanbanColumn.tsx count badges** (lines 57, 85) — verified numeric-only (`{jobs.length}`). `min-w-[20px]` retained as-is; safe because counts are pure integers, no i18n impact. Verified via re-read of the full file; no text paths flow into those Badges.

## Primary Fix — Why `whitespace-nowrap` Solves the Complaint

Before: A badge with `inline-flex` and no whitespace constraint would wrap to a second line when its content exceeded the parent's available width, creating ugly two-line badges. German translations like "Angewendet" (vs "Applied") or "Benachrichtigungen" (vs "Notifications") often pushed badges over the threshold.

After: `whitespace-nowrap` forces the badge to keep its content on a single line and grow horizontally. The badge stretches to fit the word exactly as the user requested ("Badges should respect the world length and stretch to the text size if needed"). The `inline-flex` layout already grew naturally — it was the `white-space: normal` default that was causing wraps.

## Verification

- `npx tsc --noEmit` → EXIT=0 (zero TypeScript errors)
- `__tests__/dictionaries.spec.ts` → 35/35 tests pass (all 4 locales have consistent keys, no empty values)
- No file outside the ownership list was modified.
- All 4 locales received all 6 new keys (24 dictionary entries added).
