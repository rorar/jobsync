# Manifest v2: Self-Contained Modules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make modules fully self-describing by co-locating i18n translations in the manifest and introducing self-registration, so adding/removing a module only touches the module directory + one import line.

**Architecture:** Three changes: (1) Add `i18n` field to `ModuleManifest` with per-locale name/description, (2) each module self-registers by calling `moduleRegistry.register()` on import, (3) replace 4 per-connector barrel files with 1 central `register-all.ts`. UI components read `manifest.i18n[locale]` instead of hardcoded `NAME_KEYS`/`DESCRIPTION_KEYS` maps.

**Tech Stack:** TypeScript, Next.js 15, Jest + Testing Library, Allium spec

**Spec:** `specs/module-lifecycle.allium` (needs `i18n` field on `ModuleManifest` contract)

**Roadmap:** 8.7 Phase 0 (Self-Contained Modules)

**Resource constraint:** Never run tests and builds in parallel. Single worker for tests.

---

## File Structure

### New files
- `src/lib/connector/data-enrichment/modules/logo-dev/i18n.ts` — Logo.dev translations (4 locales)
- `src/lib/connector/data-enrichment/modules/google-favicon/i18n.ts` — Google Favicon translations
- `src/lib/connector/data-enrichment/modules/meta-parser/i18n.ts` — Meta Parser translations
- `src/lib/connector/reference-data/modules/esco-classification/i18n.ts` — ESCO translations
- `src/lib/connector/reference-data/modules/eurostat-nuts/i18n.ts` — Eurostat translations
- `src/lib/connector/job-discovery/modules/eures/i18n.ts` — EURES translations
- `src/lib/connector/job-discovery/modules/arbeitsagentur/i18n.ts` — Arbeitsagentur translations
- `src/lib/connector/job-discovery/modules/jsearch/i18n.ts` — JSearch translations
- `src/lib/connector/ai-provider/modules/ollama/i18n.ts` — Ollama translations
- `src/lib/connector/ai-provider/modules/openai/i18n.ts` — OpenAI translations
- `src/lib/connector/ai-provider/modules/deepseek/i18n.ts` — DeepSeek translations
- `src/lib/connector/register-all.ts` — Central registration barrel (replaces 4 per-connector barrels)
- `__tests__/connector/manifest-i18n.spec.ts` — Tests for i18n on manifests
- `__tests__/connector/self-registration.spec.ts` — Tests for register-all.ts

### Modified files
- `src/lib/connector/manifest.ts` — Add `ModuleI18n` interface + `i18n` field to `ModuleManifest`
- `src/actions/module.actions.ts` — Add `i18n` to `ModuleManifestSummary`, replace 4 barrel imports with 1
- `src/components/settings/EnrichmentModuleSettings.tsx` — Remove `NAME_KEYS`/`DESCRIPTION_KEYS` maps, read from manifest `i18n`
- `src/components/settings/ApiStatusOverview.tsx` — Remove `MODULE_NAME_KEYS` map, read from manifest `i18n`
- `src/components/settings/ApiKeySettings.tsx` — Remove hardcoded description keys if present, read from manifest `i18n`
- `src/lib/connector/job-discovery/modules/eures/index.ts` — Add self-registration
- `src/lib/connector/job-discovery/modules/arbeitsagentur/index.ts` — Add self-registration
- `src/lib/connector/job-discovery/modules/jsearch/index.ts` — Add self-registration
- `src/lib/connector/ai-provider/modules/ollama/index.ts` — Add self-registration
- `src/lib/connector/ai-provider/modules/openai/index.ts` — Add self-registration
- `src/lib/connector/ai-provider/modules/deepseek/index.ts` — Add self-registration
- `src/lib/connector/data-enrichment/modules/logo-dev/index.ts` — Add self-registration
- `src/lib/connector/data-enrichment/modules/google-favicon/index.ts` — Add self-registration
- `src/lib/connector/data-enrichment/modules/meta-parser/index.ts` — Add self-registration
- `src/lib/connector/reference-data/modules/esco-classification/index.ts` — Add self-registration
- `src/lib/connector/reference-data/modules/eurostat-nuts/index.ts` — Add self-registration
- `src/lib/connector/job-discovery/runner.ts` — Change barrel import to `register-all.ts`
- `src/lib/connector/ai-provider/providers.ts` — Change barrel import to `register-all.ts`
- `src/i18n/dictionaries/enrichment.ts` — Remove module-specific keys (keep feature-level keys only)
- `specs/module-lifecycle.allium` — Add `i18n` field to `ModuleManifest` contract
- `__tests__/ApiStatusOverview.spec.tsx` — Update mock to include `i18n` field
- `__tests__/data-enrichment-registration.spec.ts` — Update import to `register-all.ts`

### Deleted files
- `src/lib/connector/data-enrichment/connectors.ts`
- `src/lib/connector/job-discovery/connectors.ts`
- `src/lib/connector/ai-provider/modules/connectors.ts`
- `src/lib/connector/reference-data/connectors.ts`

---

## Task 1: Extend ModuleManifest with i18n type

**Files:**
- Modify: `src/lib/connector/manifest.ts`
- Modify: `specs/module-lifecycle.allium`

- [ ] **Step 1: Add ModuleI18n interface to manifest.ts**

After the `DependencyHealthCheck` interface (around line 145), add:

```typescript
// =============================================================================
// Module i18n (Self-Contained Module Pattern)
// =============================================================================

export interface ModuleI18nEntry {
  name: string;
  description: string;
}

/** Per-locale translations for module display in UI. Keyed by locale code. */
export type ModuleI18n = Record<string, ModuleI18nEntry>;
```

- [ ] **Step 2: Add i18n field to ModuleManifest**

In the `ModuleManifest` interface, after the `dependencies` field, add:

```typescript
  /** Per-locale display name and description. UI reads this instead of global i18n dictionaries. */
  i18n?: ModuleI18n;
```

- [ ] **Step 3: Update Allium spec**

In `specs/module-lifecycle.allium`, add to the `ModuleManifest` contract after the `dependencies` field:

```
  -- i18n
  i18n: ModuleI18n?                     -- per-locale translations for UI display
                                        -- keyed by locale code (e.g. "en", "de", "fr", "es")
                                        -- UI reads manifest.i18n[locale].name instead of global i18n dictionaries
```

And add the value type after `DependencyHealthCheck`:

```
value ModuleI18n {
  -- Map of locale code to display strings
  -- Each entry: { name: String, description: String }
  -- Example: { en: { name: "EURES", description: "EU job search" }, de: { name: "EURES", description: "EU-Stellensuche" } }
}
```

- [ ] **Step 4: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors (i18n is optional, no consumers yet)

- [ ] **Step 5: Commit**

```bash
git add src/lib/connector/manifest.ts specs/module-lifecycle.allium
git commit -m "feat(manifest): add ModuleI18n type and optional i18n field to ModuleManifest

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add i18n.ts to all 11 modules

**Files:**
- Create: 11 new `i18n.ts` files (one per module)

- [ ] **Step 1: Create Logo.dev i18n**

Create `src/lib/connector/data-enrichment/modules/logo-dev/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const logoDevI18n: ModuleI18n = {
  en: { name: "Logo.dev", description: "High-quality company logos via Logo.dev (API key optional)" },
  de: { name: "Logo.dev", description: "Hochwertige Firmenlogos über Logo.dev (API-Key optional)" },
  fr: { name: "Logo.dev", description: "Logos d'entreprise via Logo.dev (clé API optionnelle)" },
  es: { name: "Logo.dev", description: "Logos de empresas vía Logo.dev (clave API opcional)" },
};
```

- [ ] **Step 2: Create Google Favicon i18n**

Create `src/lib/connector/data-enrichment/modules/google-favicon/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const googleFaviconI18n: ModuleI18n = {
  en: { name: "Google Favicon", description: "Fetch website favicons via Google" },
  de: { name: "Google Favicon", description: "Website-Favicons über Google abrufen" },
  fr: { name: "Favicon Google", description: "Récupérer les favicons via Google" },
  es: { name: "Favicon de Google", description: "Obtener favicons vía Google" },
};
```

- [ ] **Step 3: Create Meta Parser i18n**

Create `src/lib/connector/data-enrichment/modules/meta-parser/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const metaParserI18n: ModuleI18n = {
  en: { name: "Link Preview Parser", description: "Extract metadata from URLs (OpenGraph, meta tags)" },
  de: { name: "Link-Vorschau-Parser", description: "Metadaten aus URLs extrahieren (OpenGraph, Meta-Tags)" },
  fr: { name: "Analyseur d'aperçu de lien", description: "Extraire les métadonnées des URLs (OpenGraph, balises meta)" },
  es: { name: "Analizador de vista previa de enlaces", description: "Extraer metadatos de URLs (OpenGraph, etiquetas meta)" },
};
```

- [ ] **Step 4: Create ESCO Classification i18n**

Create `src/lib/connector/reference-data/modules/esco-classification/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const escoClassificationI18n: ModuleI18n = {
  en: { name: "ESCO Classification API", description: "EU ESCO occupation classification service (health monitoring)" },
  de: { name: "ESCO-Klassifikations-API", description: "EU-ESCO-Berufsklassifikationsdienst (Statusüberwachung)" },
  fr: { name: "API de classification ESCO", description: "Service de classification des professions ESCO de l'UE (surveillance de l'état)" },
  es: { name: "API de clasificación ESCO", description: "Servicio de clasificación de ocupaciones ESCO de la UE (monitoreo de estado)" },
};
```

- [ ] **Step 5: Create Eurostat NUTS i18n**

Create `src/lib/connector/reference-data/modules/eurostat-nuts/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const eurostatNutsI18n: ModuleI18n = {
  en: { name: "Eurostat NUTS Regions", description: "EU Eurostat NUTS regional classification service (health monitoring)" },
  de: { name: "Eurostat-NUTS-Regionen", description: "EU-Eurostat-NUTS-Regionalklassifikationsdienst (Statusüberwachung)" },
  fr: { name: "Régions NUTS Eurostat", description: "Service de classification régionale NUTS d'Eurostat (surveillance de l'état)" },
  es: { name: "Regiones NUTS de Eurostat", description: "Servicio de clasificación regional NUTS de Eurostat (monitoreo de estado)" },
};
```

- [ ] **Step 6: Create EURES i18n**

Create `src/lib/connector/job-discovery/modules/eures/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const euresI18n: ModuleI18n = {
  en: { name: "EURES", description: "European job search via EURES portal" },
  de: { name: "EURES", description: "Europäische Stellensuche über das EURES-Portal" },
  fr: { name: "EURES", description: "Recherche d'emploi européenne via le portail EURES" },
  es: { name: "EURES", description: "Búsqueda de empleo europea a través del portal EURES" },
};
```

- [ ] **Step 7: Create Arbeitsagentur i18n**

Create `src/lib/connector/job-discovery/modules/arbeitsagentur/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const arbeitsagenturI18n: ModuleI18n = {
  en: { name: "Arbeitsagentur", description: "German Federal Employment Agency job search" },
  de: { name: "Arbeitsagentur", description: "Jobsuche über die Bundesagentur für Arbeit" },
  fr: { name: "Arbeitsagentur", description: "Recherche d'emploi de l'Agence fédérale allemande pour l'emploi" },
  es: { name: "Arbeitsagentur", description: "Búsqueda de empleo de la Agencia Federal de Empleo de Alemania" },
};
```

- [ ] **Step 8: Create JSearch i18n**

Create `src/lib/connector/job-discovery/modules/jsearch/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const jsearchI18n: ModuleI18n = {
  en: { name: "JSearch", description: "Job search via RapidAPI JSearch (API key required)" },
  de: { name: "JSearch", description: "Jobsuche über RapidAPI JSearch (API-Key erforderlich)" },
  fr: { name: "JSearch", description: "Recherche d'emploi via RapidAPI JSearch (clé API requise)" },
  es: { name: "JSearch", description: "Búsqueda de empleo vía RapidAPI JSearch (clave API requerida)" },
};
```

- [ ] **Step 9: Create Ollama i18n**

Create `src/lib/connector/ai-provider/modules/ollama/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const ollamaI18n: ModuleI18n = {
  en: { name: "Ollama", description: "Local AI models via Ollama (no API key required)" },
  de: { name: "Ollama", description: "Lokale KI-Modelle über Ollama (kein API-Key nötig)" },
  fr: { name: "Ollama", description: "Modèles IA locaux via Ollama (aucune clé API requise)" },
  es: { name: "Ollama", description: "Modelos de IA locales vía Ollama (sin clave API)" },
};
```

- [ ] **Step 10: Create OpenAI i18n**

Create `src/lib/connector/ai-provider/modules/openai/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const openaiI18n: ModuleI18n = {
  en: { name: "OpenAI", description: "AI models via OpenAI API (API key required)" },
  de: { name: "OpenAI", description: "KI-Modelle über OpenAI API (API-Key erforderlich)" },
  fr: { name: "OpenAI", description: "Modèles IA via l'API OpenAI (clé API requise)" },
  es: { name: "OpenAI", description: "Modelos de IA vía la API de OpenAI (clave API requerida)" },
};
```

- [ ] **Step 11: Create DeepSeek i18n**

Create `src/lib/connector/ai-provider/modules/deepseek/i18n.ts`:

```typescript
import type { ModuleI18n } from "@/lib/connector/manifest";

export const deepseekI18n: ModuleI18n = {
  en: { name: "DeepSeek", description: "AI models via DeepSeek API (API key required)" },
  de: { name: "DeepSeek", description: "KI-Modelle über DeepSeek API (API-Key erforderlich)" },
  fr: { name: "DeepSeek", description: "Modèles IA via l'API DeepSeek (clé API requise)" },
  es: { name: "DeepSeek", description: "Modelos de IA vía la API de DeepSeek (clave API requerida)" },
};
```

- [ ] **Step 12: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 13: Commit**

```bash
git add src/lib/connector/*/modules/*/i18n.ts
git commit -m "feat(i18n): add co-located i18n.ts to all 11 modules

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire i18n into manifests

**Files:**
- Modify: All 11 `manifest.ts` files

- [ ] **Step 1: Add i18n to each manifest**

For every module, import its `i18n.ts` and add the `i18n` field to the manifest object. Example for Logo.dev:

```typescript
// In src/lib/connector/data-enrichment/modules/logo-dev/manifest.ts
import { logoDevI18n } from "./i18n";

export const logoDevManifest: DataEnrichmentManifest = {
  id: "logo_dev",
  name: "Logo.dev",    // ← kept as fallback for non-i18n contexts
  i18n: logoDevI18n,   // ← NEW
  // ...rest unchanged
};
```

Repeat this pattern for all 11 modules:
- `logo-dev/manifest.ts` → `import { logoDevI18n } from "./i18n"` → `i18n: logoDevI18n`
- `google-favicon/manifest.ts` → `import { googleFaviconI18n } from "./i18n"` → `i18n: googleFaviconI18n`
- `meta-parser/manifest.ts` → `import { metaParserI18n } from "./i18n"` → `i18n: metaParserI18n`
- `esco-classification/manifest.ts` → `import { escoClassificationI18n } from "./i18n"` → `i18n: escoClassificationI18n`
- `eurostat-nuts/manifest.ts` → `import { eurostatNutsI18n } from "./i18n"` → `i18n: eurostatNutsI18n`
- `eures/manifest.ts` → `import { euresI18n } from "./i18n"` → `i18n: euresI18n`
- `arbeitsagentur/manifest.ts` → `import { arbeitsagenturI18n } from "./i18n"` → `i18n: arbeitsagenturI18n`
- `jsearch/manifest.ts` → `import { jsearchI18n } from "./i18n"` → `i18n: jsearchI18n`
- `ollama/manifest.ts` → `import { ollamaI18n } from "./i18n"` → `i18n: ollamaI18n`
- `openai/manifest.ts` → `import { openaiI18n } from "./i18n"` → `i18n: openaiI18n`
- `deepseek/manifest.ts` → `import { deepseekI18n } from "./i18n"` → `i18n: deepseekI18n`

- [ ] **Step 2: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/connector/*/modules/*/manifest.ts
git commit -m "feat(manifest): wire i18n translations into all 11 module manifests

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Expose i18n in ModuleManifestSummary

**Files:**
- Modify: `src/actions/module.actions.ts`

- [ ] **Step 1: Add i18n to ModuleManifestSummary**

In `src/actions/module.actions.ts`, extend the `ModuleManifestSummary` interface:

```typescript
export interface ModuleManifestSummary {
  // ...existing fields...
  i18n?: Record<string, { name: string; description: string }>;
}
```

- [ ] **Step 2: Populate i18n in getModuleManifests mapping**

In the `summaries` mapping inside `getModuleManifests()`, add after `dependencies`:

```typescript
      i18n: m.manifest.i18n,
```

- [ ] **Step 3: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/actions/module.actions.ts
git commit -m "feat(actions): expose module i18n in ModuleManifestSummary

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Update UI components to read i18n from manifest

**Files:**
- Modify: `src/components/settings/EnrichmentModuleSettings.tsx`
- Modify: `src/components/settings/ApiStatusOverview.tsx`

- [ ] **Step 1: Update EnrichmentModuleSettings**

In `src/components/settings/EnrichmentModuleSettings.tsx`:

Remove the `DESCRIPTION_KEYS` and `NAME_KEYS` maps entirely (lines 38-49).

Replace `getModuleName` function with:

```typescript
/** Resolve display name from manifest i18n, falling back to manifest.name */
function getModuleName(module: ModuleManifestSummary): string {
  return module.i18n?.[locale]?.name ?? module.name;
}

/** Resolve description from manifest i18n */
function getModuleDescription(module: ModuleManifestSummary): string {
  return module.i18n?.[locale]?.description ?? t("enrichment.modulesDescription");
}
```

Note: `locale` comes from `const { t, locale } = useTranslations();` (already available).

Update the card rendering to use `getModuleDescription(module)` instead of `t(descKey)`.

- [ ] **Step 2: Update ApiStatusOverview**

In `src/components/settings/ApiStatusOverview.tsx`:

Remove the `MODULE_NAME_KEYS` map entirely (lines 43-49).

Replace `getModuleName` function with:

```typescript
/** Resolve display name from manifest i18n, falling back to manifest.name */
function getModuleName(module: ModuleManifestSummary): string {
  return module.i18n?.[locale]?.name ?? module.name;
}
```

Note: Need to extract `locale` from `useTranslations()`: change `const { t } = useTranslations()` to `const { t, locale } = useTranslations()`.

- [ ] **Step 3: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/EnrichmentModuleSettings.tsx src/components/settings/ApiStatusOverview.tsx
git commit -m "refactor(ui): read module names/descriptions from manifest.i18n instead of hardcoded maps

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Clean up global i18n dictionary

**Files:**
- Modify: `src/i18n/dictionaries/enrichment.ts`

- [ ] **Step 1: Remove module-specific keys from enrichment.ts**

In all 4 locale blocks, remove these keys (they now live in each module's `i18n.ts`):

```
enrichment.logoDev
enrichment.logoDevDescription
enrichment.clearbit (if still present)
enrichment.clearbitDescription (if still present)
enrichment.googleFavicon
enrichment.googleFaviconDescription
enrichment.metaParser
enrichment.metaParserDescription
enrichment.escoApi
enrichment.escoApiDescription
enrichment.eurostatNuts
enrichment.eurostatNutsDescription
```

Keep all feature-level keys: `enrichment.health.*`, `enrichment.dimension.*`, `enrichment.connectorGroup.*`, `enrichment.healthOverviewTitle`, `enrichment.noCredentialRequired`, etc.

- [ ] **Step 2: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors (if any TranslationKey references these removed keys, they will fail here — fix by verifying all consumers now use `manifest.i18n`)

- [ ] **Step 3: Commit**

```bash
git add src/i18n/dictionaries/enrichment.ts
git commit -m "refactor(i18n): remove module-specific keys from global dictionary — now co-located in modules

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Self-registration in all modules

**Files:**
- Modify: All 11 module `index.ts` files

- [ ] **Step 1: Add self-registration to each module**

At the TOP of each module's `index.ts` (before the factory function), add registration as a side-effect import. Example for Logo.dev:

```typescript
// src/lib/connector/data-enrichment/modules/logo-dev/index.ts

// Self-registration (import = register)
import { moduleRegistry } from "@/lib/connector/registry";
import { logoDevManifest } from "./manifest";
moduleRegistry.register(logoDevManifest, createLogoDevModule);
```

**Important:** The `moduleRegistry.register()` call must come AFTER the factory function definition. Since `register()` stores the factory reference (not a call result), the function must exist at the point of registration. Two valid patterns:

Pattern A — registration at bottom of file:
```typescript
export function createLogoDevModule(apiKey?: string): DataEnrichmentConnector {
  // ...existing code...
}

// Self-registration
import { moduleRegistry } from "@/lib/connector/registry";
import { logoDevManifest } from "./manifest";
moduleRegistry.register(logoDevManifest, createLogoDevModule);
```

Pattern B — registration in a separate block with hoisted function:
```typescript
import { moduleRegistry } from "@/lib/connector/registry";
import { logoDevManifest } from "./manifest";

// ...existing imports...

export function createLogoDevModule(apiKey?: string): DataEnrichmentConnector {
  // ...existing code...
}

// Self-registration (safe: function declarations are hoisted)
moduleRegistry.register(logoDevManifest, createLogoDevModule);
```

Use Pattern B — imports at top, registration at bottom. Repeat for all 11 modules:

| Module | Manifest import | Factory function |
|---|---|---|
| `logo-dev/index.ts` | `logoDevManifest` | `createLogoDevModule` |
| `google-favicon/index.ts` | `googleFaviconManifest` | `createGoogleFaviconModule` |
| `meta-parser/index.ts` | `metaParserManifest` | `createMetaParserModule` |
| `esco-classification/index.ts` | `escoClassificationManifest` | `createEscoClassificationModule` |
| `eurostat-nuts/index.ts` | `eurostatNutsManifest` | `createEurostatNutsModule` |
| `eures/index.ts` | `euresManifest` | `createEuresConnector` |
| `arbeitsagentur/index.ts` | `arbeitsagenturManifest` | `createArbeitsagenturConnector` |
| `jsearch/index.ts` | `jsearchManifest` | `createJSearchConnector` |
| `ollama/index.ts` | `ollamaManifest` | `createOllamaConnector` |
| `openai/index.ts` | `openaiManifest` | `createOpenAIConnector` |
| `deepseek/index.ts` | `deepseekManifest` | `createDeepSeekConnector` |

- [ ] **Step 2: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/connector/*/modules/*/index.ts
git commit -m "feat(connector): add self-registration to all 11 modules (import = register)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Create register-all.ts and replace barrel imports

**Files:**
- Create: `src/lib/connector/register-all.ts`
- Modify: `src/actions/module.actions.ts`
- Modify: `src/lib/connector/job-discovery/runner.ts`
- Modify: `src/lib/connector/ai-provider/providers.ts`
- Delete: 4 barrel files

- [ ] **Step 1: Create register-all.ts**

Create `src/lib/connector/register-all.ts`:

```typescript
/**
 * Central Module Registration — imports all modules to trigger self-registration.
 *
 * IMPORTANT: This file MUST be imported synchronously (not via dynamic import)
 * in every entry point that queries the ModuleRegistry (module.actions.ts,
 * runner.ts, providers.ts). Modules must be registered before the first
 * facade query (enrichmentConnectorRegistry, connectorRegistry, etc.).
 *
 * Replaces the per-connector barrel files (connectors.ts).
 * Each import triggers the module's self-registration side effect.
 */

// Job Discovery
import "./job-discovery/modules/eures";
import "./job-discovery/modules/arbeitsagentur";
import "./job-discovery/modules/jsearch";

// AI Provider
import "./ai-provider/modules/ollama";
import "./ai-provider/modules/openai";
import "./ai-provider/modules/deepseek";

// Data Enrichment
import "./data-enrichment/modules/logo-dev";
import "./data-enrichment/modules/google-favicon";
import "./data-enrichment/modules/meta-parser";

// Reference Data
import "./reference-data/modules/esco-classification";
import "./reference-data/modules/eurostat-nuts";
```

- [ ] **Step 2: Update module.actions.ts**

In `src/actions/module.actions.ts`, replace the 4 barrel imports:

```typescript
// OLD:
import "@/lib/connector/job-discovery/connectors";
import "@/lib/connector/ai-provider/modules/connectors";
import "@/lib/connector/data-enrichment/connectors";
import "@/lib/connector/reference-data/connectors";

// NEW:
import "@/lib/connector/register-all";
```

- [ ] **Step 3: Update runner.ts**

In `src/lib/connector/job-discovery/runner.ts`, replace:

```typescript
// OLD:
import "./connectors"; // trigger registration

// NEW:
import "../register-all"; // trigger all module registrations
```

- [ ] **Step 4: Update providers.ts**

In `src/lib/connector/ai-provider/providers.ts`, replace:

```typescript
// OLD:
import "./modules/connectors"; // triggers eager registration

// NEW:
import "../register-all"; // trigger all module registrations
```

- [ ] **Step 5: Delete old barrel files**

```bash
rm src/lib/connector/data-enrichment/connectors.ts
rm src/lib/connector/job-discovery/connectors.ts
rm src/lib/connector/ai-provider/modules/connectors.ts
rm src/lib/connector/reference-data/connectors.ts
```

- [ ] **Step 6: Fix any remaining imports of old barrels**

Run: `grep -rn "connectors" src/lib/connector/ --include="*.ts" | grep -v node_modules | grep -v register-all | grep import`

Fix any remaining references to the deleted barrel files.

- [ ] **Step 7: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(connector): replace 4 per-connector barrels with central register-all.ts

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Tests

**Files:**
- Create: `__tests__/connector/manifest-i18n.spec.ts`
- Create: `__tests__/connector/self-registration.spec.ts`
- Modify: `__tests__/ApiStatusOverview.spec.tsx`
- Modify: `__tests__/data-enrichment-registration.spec.ts`

- [ ] **Step 1: Write manifest i18n tests**

Create `__tests__/connector/manifest-i18n.spec.ts`:

```typescript
/**
 * Manifest i18n — verifies all modules have co-located translations
 * for all 4 supported locales.
 */

import "@/lib/connector/register-all";
import { moduleRegistry } from "@/lib/connector/registry";

const REQUIRED_LOCALES = ["en", "de", "fr", "es"];

describe("Module manifest i18n", () => {
  const moduleIds = moduleRegistry.availableModules();

  it("all modules are registered", () => {
    expect(moduleIds.length).toBeGreaterThanOrEqual(11);
  });

  for (const moduleId of moduleIds) {
    describe(`module: ${moduleId}`, () => {
      it("has i18n field on manifest", () => {
        const mod = moduleRegistry.get(moduleId);
        expect(mod?.manifest.i18n).toBeDefined();
      });

      for (const locale of REQUIRED_LOCALES) {
        it(`has ${locale} translation with name and description`, () => {
          const mod = moduleRegistry.get(moduleId);
          const entry = mod?.manifest.i18n?.[locale];
          expect(entry).toBeDefined();
          expect(entry?.name.length).toBeGreaterThan(0);
          expect(entry?.description.length).toBeGreaterThan(0);
        });
      }
    });
  }
});
```

- [ ] **Step 2: Write self-registration tests**

Create `__tests__/connector/self-registration.spec.ts`:

```typescript
/**
 * Self-registration — verifies that importing register-all.ts
 * registers all modules in the unified registry.
 */

import "@/lib/connector/register-all";
import { moduleRegistry } from "@/lib/connector/registry";
import { ConnectorType } from "@/lib/connector/manifest";

describe("register-all.ts", () => {
  it("registers all 11 modules", () => {
    expect(moduleRegistry.availableModules().length).toBe(11);
  });

  it("registers job discovery modules", () => {
    const jd = moduleRegistry.getByType(ConnectorType.JOB_DISCOVERY);
    expect(jd.map(m => m.manifest.id).sort()).toEqual(["arbeitsagentur", "eures", "jsearch"]);
  });

  it("registers ai provider modules", () => {
    const ai = moduleRegistry.getByType(ConnectorType.AI_PROVIDER);
    expect(ai.map(m => m.manifest.id).sort()).toEqual(["deepseek", "ollama", "openai"]);
  });

  it("registers data enrichment modules", () => {
    const de = moduleRegistry.getByType(ConnectorType.DATA_ENRICHMENT);
    expect(de.map(m => m.manifest.id).sort()).toEqual(["google_favicon", "logo_dev", "meta_parser"]);
  });

  it("registers reference data modules", () => {
    const rd = moduleRegistry.getByType(ConnectorType.REFERENCE_DATA);
    expect(rd.map(m => m.manifest.id).sort()).toEqual(["esco_classification", "eurostat_nuts"]);
  });
});
```

- [ ] **Step 3: Update ApiStatusOverview test mock**

In `__tests__/ApiStatusOverview.spec.tsx`, add `i18n` to test fixtures:

```typescript
const enrichmentModuleActive = {
  // ...existing fields...
  i18n: { en: { name: "Logo.dev", description: "Test" } },
};
```

Update the i18n mock dict — remove the module-specific keys (`enrichment.logoDev` etc.) since the component now reads from `module.i18n`.

- [ ] **Step 4: Update registration test import**

In `__tests__/data-enrichment-registration.spec.ts`, replace:

```typescript
// OLD:
import "@/lib/connector/data-enrichment/connectors";
import "@/lib/connector/reference-data/connectors";

// NEW:
import "@/lib/connector/register-all";
```

- [ ] **Step 5: Run all tests**

Run: `bash scripts/test.sh --no-coverage -- --testPathPattern "manifest-i18n|self-registration|ApiStatus|data-enrichment-registration"`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: add manifest i18n and self-registration tests, update existing tests

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 2: Run full test suite**

Run: `bash scripts/test.sh --no-coverage`
Expected: No new failures

- [ ] **Step 3: Verify no stale imports**

```bash
# No references to old barrel files
grep -rn "data-enrichment/connectors\|job-discovery/connectors\|ai-provider/modules/connectors\|reference-data/connectors" src/ --include="*.ts" --include="*.tsx"
```
Expected: 0 results

```bash
# No remaining hardcoded module name maps
grep -n "NAME_KEYS\|DESCRIPTION_KEYS\|MODULE_NAME_KEYS" src/components/settings/
```
Expected: 0 results

```bash
# No orphaned module-specific i18n keys in global dictionaries
grep -n "enrichment\.logoDev\b\|enrichment\.googleFavicon\b\|enrichment\.metaParser\b\|enrichment\.escoApi\b\|enrichment\.eurostatNuts\b" src/i18n/dictionaries/
```
Expected: 0 results

- [ ] **Step 4: Verify old barrel files are gone**

```bash
ls src/lib/connector/data-enrichment/connectors.ts src/lib/connector/job-discovery/connectors.ts src/lib/connector/ai-provider/modules/connectors.ts src/lib/connector/reference-data/connectors.ts 2>&1
```
Expected: All "No such file or directory"

- [ ] **Step 5: Commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: final cleanup after Manifest v2 migration

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
