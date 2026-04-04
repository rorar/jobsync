# Architecture Design: Manifest-Driven AutomationWizard

## 1. Backend Architecture

### 1.1 Type System Changes

**File: `src/lib/connector/manifest.ts`**

Three new types are added to the Published Language. The existing `JobDiscoveryManifest` interface is modified, and `ModuleManifest` gains two future-proofing fields.

```typescript
// --- NEW: ConnectorParamField (replaces ad-hoc Record shapes) ---

export interface ConnectorParamField {
  key: string;
  type: "string" | "number" | "boolean" | "select" | "multiselect";
  label: string;                      // i18n key, e.g. "automations.params.umkreis"
  defaultValue?: string | number | boolean | string[];
  options?: readonly (string | number)[];  // for select + multiselect
  required?: boolean;
  min?: number;                        // for number type
  max?: number;                        // for number type
  placeholder?: string;                // i18n key or literal fallback
}

export type ConnectorParamsSchema = ConnectorParamField[];

// --- NEW: SearchFieldOverride ---

export interface SearchFieldOverride {
  field: "keywords" | "location";
  widgetId: string;                    // registry key, e.g. "eures-occupation"
}

// --- MODIFIED: ModuleManifest ---

export interface ModuleManifest {
  id: string;
  name: string;
  connectorType: ConnectorType;
  credential: CredentialRequirement;
  settingsSchema?: SettingsSchema;
  healthCheck?: HealthCheckConfig;
  resilience?: ResilienceConfig;
  manifestVersion: number;             // NEW — starts at 1
  automationType?: "discovery" | "maintenance";  // NEW — future 3.8
}

// --- MODIFIED: JobDiscoveryManifest ---

export interface JobDiscoveryManifest extends ModuleManifest {
  connectorType: ConnectorType.JOB_DISCOVERY;
  connectorParamsSchema?: ConnectorParamsSchema;    // CHANGED: was Record<string, unknown>
  searchFieldOverrides?: SearchFieldOverride[];      // NEW
}

// AiManifest: unchanged (no connectorParamsSchema, no searchFieldOverrides)
```

**Design rationale:**

- `ConnectorParamsSchema` is an **array** (not a Record) for deterministic field ordering in UI rendering. This matches the existing `SettingsSchema.fields` pattern.
- `defaultValue` supports `string[]` for multiselect fields (pre-selected options).
- `options` is `readonly` to prevent accidental mutation of manifest constants.
- `searchFieldOverrides` is deliberately separate from `connectorParamsSchema`. Override widgets replace the *shared* fields (keywords, location) that every module uses. `connectorParamsSchema` declares *module-specific* fields that appear under "Advanced Search Options."
- `manifestVersion` is a plain number (not semver). Module SDK (Roadmap 8.7) will use it for compatibility checks.

### 1.2 Module Manifest Updates

**EURES** (`src/lib/connector/job-discovery/modules/eures/manifest.ts`):

```typescript
export const euresManifest: JobDiscoveryManifest = {
  // ...existing fields unchanged...
  manifestVersion: 1,
  automationType: "discovery",
  searchFieldOverrides: [
    { field: "keywords", widgetId: "eures-occupation" },
    { field: "location", widgetId: "eures-location" },
  ],
  connectorParamsSchema: [
    {
      key: "publicationPeriod",
      type: "select",
      label: "automations.params.publicationPeriod",
      defaultValue: "LAST_WEEK",
      options: ["LAST_DAY", "LAST_THREE_DAYS", "LAST_WEEK", "LAST_MONTH"],
    },
    {
      key: "requiredExperienceCodes",
      type: "multiselect",
      label: "automations.params.experienceLevel",
      options: [
        "none_required", "up_to_1_year", "between_1_and_2_years",
        "between_2_and_5_years", "more_than_5_years",
      ],
    },
    {
      key: "positionOfferingCodes",
      type: "multiselect",
      label: "automations.params.positionOffering",
      options: [
        "directhire", "contract", "temporary", "internship",
        "apprenticeship", "selfemployed", "seasonal", "volunteer",
      ],
    },
    {
      key: "positionScheduleCodes",
      type: "multiselect",
      label: "automations.params.workingTime",
      options: ["fulltime", "parttime", "flextime"],
    },
    {
      key: "educationLevelCodes",
      type: "multiselect",
      label: "automations.params.educationLevel",
      options: ["basic", "medium", "bachelor", "master", "tertiary", "doctoral"],
    },
    {
      key: "sectorCodes",
      type: "multiselect",
      label: "automations.params.sector",
      options: [
        "a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u",
      ],
    },
    {
      key: "euresFlagCodes",
      type: "multiselect",
      label: "automations.params.euresFlag",
      options: ["WITH", "WITHOUT"],
    },
    {
      key: "requiredLanguages",
      type: "string",
      label: "automations.params.requiredLanguages",
      placeholder: "de(B2), en(C1)",
    },
    {
      key: "sortSearch",
      type: "select",
      label: "automations.params.sortOrder",
      defaultValue: "MOST_RECENT",
      options: ["BEST_MATCH", "MOST_RECENT"],
    },
  ],
};
```

The EURES connector's `search()` method must be updated to read these params from `connectorParams` with fallbacks to defaults. The hardcoded `publicationPeriod: "LAST_WEEK"` and `sortSearch: "MOST_RECENT"` in `eures/index.ts` become:

```typescript
const publicationPeriod = (connectorParams.publicationPeriod as string) ?? "LAST_WEEK";
const sortSearch = (connectorParams.sortSearch as string) ?? "MOST_RECENT";
const requiredExperienceCodes = (connectorParams.requiredExperienceCodes as string[]) ?? [];
// ...etc for all connectorParamsSchema fields
```

**Arbeitsagentur** (`src/lib/connector/job-discovery/modules/arbeitsagentur/manifest.ts`):

```typescript
export const arbeitsagenturManifest: JobDiscoveryManifest = {
  // ...existing fields unchanged...
  manifestVersion: 1,
  automationType: "discovery",
  connectorParamsSchema: [
    {
      key: "umkreis",
      type: "number",
      label: "automations.params.umkreis",
      defaultValue: 25,
      min: 0,
      max: 200,
    },
    {
      key: "veroeffentlichtseit",
      type: "number",
      label: "automations.params.veroeffentlichtseit",
      defaultValue: 7,
      min: 1,
      max: 30,
    },
    {
      key: "arbeitszeit",
      type: "select",
      label: "automations.params.arbeitszeit",
      options: ["vz", "tz", "snw", "mj", "ho"],
    },
    {
      key: "befristung",
      type: "select",
      label: "automations.params.befristung",
      options: [1, 2],
    },
  ],
};
```

Labels changed from hardcoded English to i18n keys.

**JSearch** (`src/lib/connector/job-discovery/modules/jsearch/manifest.ts`):

```typescript
export const jsearchManifest: JobDiscoveryManifest = {
  // ...existing fields unchanged...
  manifestVersion: 1,
  automationType: "discovery",
  // No connectorParamsSchema — plain text inputs for keywords/location
  // No searchFieldOverrides — uses default Input widgets
};
```

**AI Manifests** (ollama, openai, deepseek): Add `manifestVersion: 1` only. No `automationType` (not applicable to AI modules).

### 1.3 ModuleManifestSummary Extension

**File: `src/actions/module.actions.ts`**

The DTO must transport `connectorParamsSchema` and `searchFieldOverrides` to the client. These are pure JSON-serializable arrays, so no special serialization is needed.

```typescript
export interface ModuleManifestSummary {
  moduleId: string;
  name: string;
  connectorType: string;
  status: string;
  healthStatus: string;
  lastHealthCheck?: string;
  lastSuccessfulConnection?: string;
  credential: {
    type: string;
    moduleId: string;
    required: boolean;
    sensitive: boolean;
    placeholder?: string;
    defaultValue?: string;
  };
  // NEW fields:
  connectorParamsSchema?: ConnectorParamField[];      // from manifest
  searchFieldOverrides?: SearchFieldOverride[];         // from manifest
  manifestVersion: number;
  automationType?: "discovery" | "maintenance";
}
```

The mapping in `getModuleManifests()` adds:

```typescript
const summaries: ModuleManifestSummary[] = modules.map((m) => {
  const jdManifest = m.manifest.connectorType === ConnectorType.JOB_DISCOVERY
    ? (m.manifest as JobDiscoveryManifest)
    : undefined;

  return {
    // ...existing fields...
    connectorParamsSchema: jdManifest?.connectorParamsSchema,
    searchFieldOverrides: jdManifest?.searchFieldOverrides,
    manifestVersion: m.manifest.manifestVersion,
    automationType: m.manifest.automationType,
  };
});
```

**Import consideration:** `ConnectorParamField` and `SearchFieldOverride` types must be importable by both server and client code. Since they are pure interfaces (no server-only logic), they are defined in `manifest.ts` and re-exported through a barrel. The DTO file imports them with `import type` which is erased at compile time.

### 1.4 Params Validator Changes

**File: `src/lib/connector/params-validator.ts`**

The validator transitions from Record-based iteration (`Object.entries(schema)`) to Array-based iteration. It imports `ConnectorParamField` directly instead of defining a local `ParamFieldDescriptor`.

```typescript
import type { ConnectorParamField, JobDiscoveryManifest } from "./manifest";

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateConnectorParams(
  moduleId: string,
  connectorParams: Record<string, unknown> | null | undefined,
): ValidationResult {
  const registered = moduleRegistry.get(moduleId);
  if (!registered) {
    return { valid: false, errors: [`Unknown module: ${moduleId}`] };
  }

  const manifest = registered.manifest as JobDiscoveryManifest;
  const schema = manifest.connectorParamsSchema;

  // No schema declared -> all params are valid (pass-through)
  if (!schema || schema.length === 0) return { valid: true };

  // No params provided -> valid (all fields optional unless marked required)
  if (!connectorParams) return { valid: true };

  const errors: string[] = [];

  // Iterate the ARRAY (deterministic order)
  for (const field of schema) {
    const value = connectorParams[field.key];

    // Required check
    if (field.required && (value === undefined || value === null)) {
      errors.push(`Missing required field: ${field.key}`);
      continue;
    }
    if (value === undefined || value === null) continue;

    // Type validation
    switch (field.type) {
      case "number":
        if (typeof value !== "number") {
          errors.push(`Invalid type for ${field.key}: expected number, got ${typeof value}`);
          continue;
        }
        if (field.min !== undefined && value < field.min) {
          errors.push(`${field.key} must be >= ${field.min}`);
        }
        if (field.max !== undefined && value > field.max) {
          errors.push(`${field.key} must be <= ${field.max}`);
        }
        break;

      case "boolean":
        if (typeof value !== "boolean") {
          errors.push(`Invalid type for ${field.key}: expected boolean, got ${typeof value}`);
        }
        break;

      case "select":
        if (field.options) {
          const allowed = field.options.map(String);
          if (!allowed.includes(String(value))) {
            errors.push(`Invalid value for ${field.key}: "${value}". Allowed: ${field.options.join(", ")}`);
          }
        }
        break;

      case "multiselect":
        if (!Array.isArray(value)) {
          errors.push(`Invalid type for ${field.key}: expected array, got ${typeof value}`);
        } else if (field.options) {
          const allowed = new Set(field.options.map(String));
          for (const item of value) {
            if (!allowed.has(String(item))) {
              errors.push(`Invalid value in ${field.key}: "${item}". Allowed: ${field.options.join(", ")}`);
            }
          }
        }
        break;

      case "string":
        if (typeof value !== "string") {
          errors.push(`Invalid type for ${field.key}: expected string, got ${typeof value}`);
        }
        break;
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}
```

**Key changes:**
- `multiselect` validation: checks that the value is an array and that every element is in the allowed `options`.
- `number` validation: adds min/max boundary checks.
- No more `Object.entries` -- direct array iteration.

### 1.5 Dynamic JobBoard Validation

**File: `src/models/automation.schema.ts`**

The hardcoded `z.enum(["jsearch", "eures", "arbeitsagentur"])` is replaced with a dynamic string validation. We cannot use a runtime registry check inside a Zod schema (schemas are static). Instead, we relax to `z.string().min(1)` and validate against the registry in the server action.

```typescript
// BEFORE:
export const JobBoardSchema = z.enum(["jsearch", "eures", "arbeitsagentur"]);

// AFTER:
export const JobBoardSchema = z.string().min(1, "Job board is required");
```

The server action `createAutomation` in `automation.actions.ts` already calls `validateConnectorParams(data.jobBoard, ...)`. We add a registry existence check there:

```typescript
// In createAutomation(), after Zod parse:
if (!moduleRegistry.has(data.jobBoard)) {
  return { success: false, message: `Unknown job board: ${data.jobBoard}` };
}
```

**Impact on `automation.model.ts`:** The `JobBoard` type becomes a string alias:

```typescript
// BEFORE:
export type JobBoard = "jsearch" | "eures" | "arbeitsagentur";

// AFTER:
export type JobBoard = string;
```

This is backward compatible -- all existing code that assigns specific strings still works. The `AutomationWizard` UI populates from the registry, so the user can never submit an invalid moduleId.

### 1.6 Prisma Migration: scheduleFrequency

**File: `prisma/schema.prisma`** (Automation model):

```prisma
model Automation {
  // ...existing fields...
  scheduleFrequency String @default("daily")   // NEW
}
```

**Migration script: `scripts/migrate-schedule-frequency.ts`**

```typescript
// 1. Read all automations
// 2. For each: parse connectorParams JSON, extract scheduleFrequency
// 3. Write scheduleFrequency to the new column
// 4. Remove scheduleFrequency from the JSON blob, update connectorParams
```

**Runner change** (`src/lib/connector/job-discovery/runner.ts`):

```typescript
// BEFORE:
const connectorParams = automation.connectorParams ? JSON.parse(automation.connectorParams as string) : {};
const scheduleFrequency: ScheduleFrequency = connectorParams.scheduleFrequency || "daily";

// AFTER:
const connectorParams = automation.connectorParams ? JSON.parse(automation.connectorParams as string) : {};
const scheduleFrequency: ScheduleFrequency = (automation as any).scheduleFrequency || "daily";
// (Cast because Automation model type may not be updated yet. After model update, cast is removed.)
```

**Schema change** (`src/models/automation.schema.ts`):

```typescript
export const CreateAutomationSchema = z.object({
  // ...existing fields...
  scheduleFrequency: z.enum(["6h", "12h", "daily", "2d", "weekly"]).default("daily"),  // NEW
});
```

**Model change** (`src/models/automation.model.ts`):

```typescript
export interface Automation {
  // ...existing fields...
  scheduleFrequency: string;  // NEW
}
```

---

## 2. Frontend Architecture

### 2.1 Component Hierarchy

```
AutomationWizard.tsx (thin wrapper — Dialog + hook + shell)
  |
  +-- useAutomationWizard.ts (headless state machine hook)
  |     |
  |     +-- reads: ModuleManifestSummary[] (from getActiveModules server action)
  |     +-- manages: react-hook-form, step navigation, connectorParams state
  |     +-- exposes: WizardState + WizardActions
  |
  +-- WizardShell.tsx (presentation layer)
        |
        +-- Step 0: BasicsStep (name, module selector, credential feedback)
        +-- Step 1: SearchStep
        |     |
        |     +-- Keywords field (widget from registry OR default Input)
        |     +-- Location field (widget from registry OR default Input)
        |     +-- DynamicParamsForm (if schema has fields)
        |           |
        |           +-- StringField (Input)
        |           +-- NumberField (Input type="number" with min/max)
        |           +-- BooleanField (Switch)
        |           +-- SelectField (Select with localized options)
        |           +-- MultiselectField (Select + ChipList)
        |
        +-- Step 2: ResumeStep (resume combobox)
        +-- Step 3: MatchingStep (AI toggle, threshold slider)
        +-- Step 4: ScheduleStep (frequency, hour)
        +-- Step 5: ReviewStep (summary with dynamic params rendering)
```

**File tree:**

```
src/components/automations/
  AutomationWizard.tsx          # REFACTORED: ~60 lines (Dialog + hook + shell)
  useAutomationWizard.ts        # NEW: headless state machine
  WizardShell.tsx               # NEW: pure presenter
  DynamicParamsForm.tsx          # NEW: schema-driven form renderer
  widget-registry.ts             # NEW: widgetId -> React component map
  EuresOccupationCombobox.tsx   # EXISTING: unchanged
  EuresLocationCombobox.tsx     # EXISTING: unchanged
```

### 2.2 useAutomationWizard Hook

**File: `src/components/automations/useAutomationWizard.ts`**

This is the core of the refactoring. All business logic currently in `AutomationWizard.tsx` moves here.

```typescript
import { useState, useEffect, useRef, useCallback } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ModuleManifestSummary } from "@/actions/module.actions";
import type { ConnectorParamField, SearchFieldOverride } from "@/lib/connector/manifest";
import type { AutomationWithResume } from "@/models/automation.model";
import { CreateAutomationSchema, type CreateAutomationInput } from "@/models/automation.schema";

// ---------- Public types ----------

export interface WizardStepDef {
  id: string;
  titleKey: string;   // i18n key
  descKey: string;     // i18n key
}

export interface WizardState {
  step: number;
  steps: WizardStepDef[];
  form: UseFormReturn<CreateAutomationInput>;
  selectedModule: ModuleManifestSummary | null;
  paramsSchema: ConnectorParamField[] | null;
  searchFieldOverrides: SearchFieldOverride[];
  connectorParamsValues: Record<string, unknown>;
  scheduleFrequency: ScheduleFrequency;
  aiScoringEnabled: boolean;
  isEditing: boolean;
  canNext: boolean;
  canBack: boolean;
  canSubmit: boolean;
  isSubmitting: boolean;
  // Credential awareness
  configuredKeyModuleIds: Set<string>;
  availableModules: ModuleManifestSummary[];
}

export interface WizardActions {
  next: () => void;
  back: () => void;
  goTo: (step: number) => void;
  submit: () => Promise<void>;
  submitAndRun: () => Promise<void>;
  selectModule: (moduleId: string) => void;
  updateConnectorParam: (key: string, value: unknown) => void;
  setScheduleFrequency: (freq: ScheduleFrequency) => void;
  setAiScoringEnabled: (enabled: boolean) => void;
  close: () => void;
}

export type UseAutomationWizardReturn = WizardState & WizardActions;

// ---------- Options ----------

interface UseAutomationWizardOptions {
  modules: ModuleManifestSummary[];
  configuredKeyModuleIds: Set<string>;
  resumes: Resume[];
  editAutomation?: AutomationWithResume | null;
  onSuccess: () => void;
  onClose: () => void;
}
```

**Step sequence logic:**

The hook computes the step list dynamically. For the current `"discovery"` automationType, the steps are always:

```typescript
const DISCOVERY_STEPS: WizardStepDef[] = [
  { id: "basics",   titleKey: "automations.stepBasics",   descKey: "automations.stepBasicsDesc" },
  { id: "search",   titleKey: "automations.stepSearch",   descKey: "automations.stepSearchDesc" },
  { id: "resume",   titleKey: "automations.stepResume",   descKey: "automations.stepResumeDesc" },
  { id: "matching", titleKey: "automations.stepMatching", descKey: "automations.stepMatchingDesc" },
  { id: "schedule", titleKey: "automations.stepSchedule", descKey: "automations.stepScheduleDesc" },
  { id: "review",   titleKey: "automations.stepReview",   descKey: "automations.stepReviewDesc" },
];
```

Note: The "search" step always exists. The DynamicParamsForm renders *within* the search step (below keywords/location) when the selected module has a `connectorParamsSchema`. There is no separate "connectorParams" step -- this avoids an empty step for modules without a schema.

**Module change behavior:**

```typescript
const selectModule = useCallback((moduleId: string) => {
  form.setValue("jobBoard", moduleId);

  const mod = modules.find((m) => m.moduleId === moduleId);
  if (!mod) return;

  setSelectedModule(mod);

  // Reset connectorParams to defaults from the new module's schema
  const defaults: Record<string, unknown> = {};
  if (mod.connectorParamsSchema) {
    for (const field of mod.connectorParamsSchema) {
      if (field.defaultValue !== undefined) {
        defaults[field.key] = field.defaultValue;
      }
    }
  }
  setConnectorParamsValues(defaults);

  // Serialize defaults to the form's connectorParams JSON field
  // Preserve system params (e.g., language for EURES)
  const systemParams = getSystemParams(moduleId);
  form.setValue("connectorParams", JSON.stringify({ ...defaults, ...systemParams }));
}, [modules, form]);
```

**Connector params sync:**

The hook maintains a `connectorParamsValues: Record<string, unknown>` state that maps field keys to their current values. When any value changes (via `updateConnectorParam`), the hook serializes the entire object to the form's `connectorParams` string field:

```typescript
const updateConnectorParam = useCallback((key: string, value: unknown) => {
  setConnectorParamsValues((prev) => {
    const next = { ...prev, [key]: value };
    // Merge with system params and serialize
    const systemParams = getSystemParams(form.getValues("jobBoard"));
    form.setValue("connectorParams", JSON.stringify({ ...next, ...systemParams }));
    return next;
  });
}, [form]);
```

**System params** are module-specific values that the wizard injects but the user does not configure (e.g., EURES `language` from `document.documentElement.lang`). The hook manages these separately:

```typescript
function getSystemParams(moduleId: string): Record<string, unknown> {
  if (moduleId === "eures") {
    return { language: document.documentElement.lang || "en" };
  }
  return {};
}
```

This is the *one* remaining module-specific check in the hook. It could be further abstracted into a manifest field (e.g., `systemParamsInjectors`), but that is over-engineering for a single case. The EURES language injection is a system concern (reading the browser locale), not a user-configurable param.

**Edit mode:**

When `editAutomation` is provided, the hook initializes form values from the existing automation and parses `connectorParams` JSON to populate `connectorParamsValues`:

```typescript
useEffect(() => {
  if (!editAutomation) return;

  const parsed = tryParseJSON(editAutomation.connectorParams);
  const mod = modules.find((m) => m.moduleId === editAutomation.jobBoard);

  // Extract user-configurable params (those declared in schema)
  const paramValues: Record<string, unknown> = {};
  if (mod?.connectorParamsSchema && parsed) {
    for (const field of mod.connectorParamsSchema) {
      if (parsed[field.key] !== undefined) {
        paramValues[field.key] = parsed[field.key];
      } else if (field.defaultValue !== undefined) {
        paramValues[field.key] = field.defaultValue;
      }
    }
  }

  setConnectorParamsValues(paramValues);
  setSelectedModule(mod ?? null);

  // Restore scheduleFrequency from the new column (post-migration)
  // or from connectorParams JSON (pre-migration backward compat)
  const freq = (editAutomation as any).scheduleFrequency
    ?? parsed?.scheduleFrequency
    ?? "daily";
  setScheduleFrequency(freq);
}, [editAutomation, modules]);
```

### 2.3 DynamicParamsForm Component

**File: `src/components/automations/DynamicParamsForm.tsx`**

```typescript
"use client";

import type { ConnectorParamField } from "@/lib/connector/manifest";
import { useTranslations } from "@/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface DynamicParamsFormProps {
  moduleId: string;
  schema: ConnectorParamField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors?: Record<string, string>;
}

export function DynamicParamsForm({
  moduleId,
  schema,
  values,
  onChange,
  errors,
}: DynamicParamsFormProps) {
  const { t } = useTranslations();

  if (schema.length === 0) return null;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-muted-foreground">
        {t("automations.connectorParams")}
      </h4>
      {schema.map((field) => (
        <DynamicField
          key={field.key}
          moduleId={moduleId}
          field={field}
          value={values[field.key]}
          onChange={(value) => onChange(field.key, value)}
          error={errors?.[field.key]}
          t={t}
        />
      ))}
    </div>
  );
}
```

**DynamicField** is a private component that dispatches on `field.type`:

```typescript
function DynamicField({ moduleId, field, value, onChange, error, t }) {
  const label = resolveLabel(t, field.label);

  switch (field.type) {
    case "string":
      return (
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Input
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ? resolveLabel(t, field.placeholder) : undefined}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Input
            type="number"
            value={value ?? field.defaultValue ?? ""}
            min={field.min}
            max={field.max}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );

    case "boolean":
      return (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label>{label}</Label>
          <Switch
            checked={!!value}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      );

    case "select":
      return (
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Select
            value={value !== undefined ? String(value) : undefined}
            onValueChange={(val) => onChange(coerceSelectValue(field, val))}
          >
            <SelectTrigger>
              <SelectValue placeholder={resolveLabel(t, field.label)} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={String(opt)} value={String(opt)}>
                  {resolveOptionLabel(t, moduleId, field.key, opt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );

    case "multiselect":
      return (
        <MultiselectField
          moduleId={moduleId}
          field={field}
          value={(value as (string | number)[]) ?? []}
          onChange={onChange}
          label={label}
          error={error}
          t={t}
        />
      );

    default:
      return null; // Unknown field type: graceful degradation
  }
}
```

**MultiselectField** uses a Shadcn Select for adding items and renders selected items as Badge chips (similar to ChipList but simpler -- no edit mode needed):

```typescript
function MultiselectField({ moduleId, field, value, onChange, label, error, t }) {
  const selected = new Set(value.map(String));
  const available = (field.options ?? []).filter((opt) => !selected.has(String(opt)));

  const addItem = (val: string) => {
    const coerced = coerceSelectValue(field, val);
    onChange([...value, coerced]);
  };

  const removeItem = (val: string) => {
    onChange(value.filter((v) => String(v) !== val));
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {/* Selected items as chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <Badge key={String(item)} variant="secondary" className="gap-1 pr-1">
              {resolveOptionLabel(t, moduleId, field.key, item)}
              <button
                type="button"
                onClick={() => removeItem(String(item))}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {/* Dropdown to add more */}
      {available.length > 0 && (
        <Select onValueChange={addItem}>
          <SelectTrigger>
            <SelectValue placeholder={t("automations.addFilter")} />
          </SelectTrigger>
          <SelectContent>
            {available.map((opt) => (
              <SelectItem key={String(opt)} value={String(opt)}>
                {resolveOptionLabel(t, moduleId, field.key, opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

### 2.4 Widget Registry

**File: `src/components/automations/widget-registry.ts`**

```typescript
import type { ComponentType } from "react";
import type { ControllerRenderProps } from "react-hook-form";
import type { CreateAutomationInput } from "@/models/automation.schema";

/**
 * Props contract for search field override widgets.
 *
 * Widgets replace the default Input for "keywords" or "location" fields.
 * They receive the react-hook-form field binding and optional connector context.
 */
export interface SearchFieldWidgetProps {
  field: ControllerRenderProps<CreateAutomationInput, "keywords"> |
         ControllerRenderProps<CreateAutomationInput, "location">;
  /** Current connectorParams (parsed). Widgets may read system params (e.g., language). */
  connectorParams?: Record<string, unknown>;
}

/**
 * Widget registry: maps widgetId -> React component.
 *
 * First-party only. Third-party modules (Roadmap 8.7) use built-in field types.
 * Lazy-loaded to avoid circular imports (widgets import heavy UI dependencies).
 */
const WIDGET_REGISTRY: Record<string, () => Promise<{ default: ComponentType<SearchFieldWidgetProps> }>> = {
  "eures-occupation": () => import("./EuresOccupationWidgetAdapter"),
  "eures-location": () => import("./EuresLocationWidgetAdapter"),
};

/**
 * Resolve a widgetId to a lazy-loadable component.
 * Returns undefined if widgetId is not registered (falls back to default Input).
 */
export function getWidget(widgetId: string): (() => Promise<{ default: ComponentType<SearchFieldWidgetProps> }>) | undefined {
  return WIDGET_REGISTRY[widgetId];
}

/**
 * Check if a widgetId is registered.
 */
export function hasWidget(widgetId: string): boolean {
  return widgetId in WIDGET_REGISTRY;
}
```

**Widget adapters:**

The existing `EuresOccupationCombobox` and `EuresLocationCombobox` have a slightly different prop signature (`field` is typed to specific field names, and the Occupation combobox takes a `language` prop). Thin adapter files bridge the gap:

**File: `src/components/automations/EuresOccupationWidgetAdapter.tsx`**

```typescript
"use client";

import { EuresOccupationCombobox } from "./EuresOccupationCombobox";
import type { SearchFieldWidgetProps } from "./widget-registry";

export default function EuresOccupationWidgetAdapter({ field, connectorParams }: SearchFieldWidgetProps) {
  return (
    <EuresOccupationCombobox
      field={field as any}
      language={connectorParams?.language as string}
    />
  );
}
```

**File: `src/components/automations/EuresLocationWidgetAdapter.tsx`**

```typescript
"use client";

import { EuresLocationCombobox } from "./EuresLocationCombobox";
import type { SearchFieldWidgetProps } from "./widget-registry";

export default function EuresLocationWidgetAdapter({ field }: SearchFieldWidgetProps) {
  return <EuresLocationCombobox field={field as any} />;
}
```

The `as any` cast is safe because both comboboxes internally only use `field.value` and `field.onChange`, which exist on all `ControllerRenderProps` variants.

**Why lazy loading?** The EURES comboboxes import heavy dependencies (ESCO search API types, country data, flag SVGs). Lazy loading ensures they are only bundled when a user selects EURES. For the initial render (e.g., JSearch selected by default), the widget registry contributes zero bundle size.

### 2.5 WizardShell Presenter

**File: `src/components/automations/WizardShell.tsx`**

The shell is a pure presentational component. It receives `WizardState & WizardActions` and renders the appropriate step UI. It has zero business logic.

```typescript
"use client";

import { Suspense, lazy, useMemo } from "react";
import type { UseAutomationWizardReturn } from "./useAutomationWizard";
import { DynamicParamsForm } from "./DynamicParamsForm";
import { getWidget, hasWidget } from "./widget-registry";
import type { SearchFieldOverride } from "@/lib/connector/manifest";
import { useTranslations } from "@/i18n";
// ...Shadcn UI imports...

interface WizardShellProps {
  wizard: UseAutomationWizardReturn;
  resumes: Resume[];
}

export function WizardShell({ wizard, resumes }: WizardShellProps) {
  const { t } = useTranslations();

  // Resolve widget overrides for keywords and location
  const keywordsWidget = useResolvedWidget(wizard.searchFieldOverrides, "keywords");
  const locationWidget = useResolvedWidget(wizard.searchFieldOverrides, "location");

  return (
    <>
      {/* Progress bar */}
      <div className="flex justify-center gap-1 mb-4">
        {wizard.steps.map((_, i) => (
          <div key={i} className={`h-1 w-8 rounded-full ${i <= wizard.step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      {/* Step content */}
      {wizard.step === 0 && <BasicsStep wizard={wizard} />}
      {wizard.step === 1 && (
        <SearchStep
          wizard={wizard}
          keywordsWidget={keywordsWidget}
          locationWidget={locationWidget}
        />
      )}
      {wizard.step === 2 && <ResumeStep wizard={wizard} resumes={resumes} />}
      {wizard.step === 3 && <MatchingStep wizard={wizard} />}
      {wizard.step === 4 && <ScheduleStep wizard={wizard} />}
      {wizard.step === 5 && <ReviewStep wizard={wizard} resumes={resumes} />}

      {/* Navigation footer */}
      <WizardFooter wizard={wizard} />
    </>
  );
}
```

**SearchStep** is the key step where dynamic rendering happens:

```typescript
function SearchStep({ wizard, keywordsWidget, locationWidget }) {
  const { t } = useTranslations();
  const KeywordsWidget = keywordsWidget;
  const LocationWidget = locationWidget;

  return (
    <div className="space-y-4">
      {/* Keywords field */}
      <FormField
        control={wizard.form.control}
        name="keywords"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("automations.searchKeywords")}</FormLabel>
            <FormControl>
              {KeywordsWidget ? (
                <Suspense fallback={<Input disabled placeholder="Loading..." />}>
                  <KeywordsWidget
                    field={field}
                    connectorParams={wizard.connectorParamsValues}
                  />
                </Suspense>
              ) : (
                <Input placeholder={t("automations.keywordsPlaceholder")} {...field} />
              )}
            </FormControl>
            {!KeywordsWidget && (
              <FormDescription>{t("automations.keywordsDesc")}</FormDescription>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Location field */}
      <FormField
        control={wizard.form.control}
        name="location"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("automations.location")}</FormLabel>
            <FormControl>
              {LocationWidget ? (
                <Suspense fallback={<Input disabled placeholder="Loading..." />}>
                  <LocationWidget
                    field={field}
                    connectorParams={wizard.connectorParamsValues}
                  />
                </Suspense>
              ) : (
                <Input placeholder={t("automations.locationPlaceholder")} {...field} />
              )}
            </FormControl>
            {!LocationWidget && (
              <FormDescription>{t("automations.locationDesc")}</FormDescription>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Dynamic connector params (Advanced Search Options) */}
      {wizard.paramsSchema && wizard.paramsSchema.length > 0 && wizard.selectedModule && (
        <DynamicParamsForm
          moduleId={wizard.selectedModule.moduleId}
          schema={wizard.paramsSchema}
          values={wizard.connectorParamsValues}
          onChange={wizard.updateConnectorParam}
        />
      )}
    </div>
  );
}
```

**useResolvedWidget** is a helper hook that resolves `searchFieldOverrides` to lazy React components:

```typescript
function useResolvedWidget(
  overrides: SearchFieldOverride[],
  field: "keywords" | "location",
): ComponentType<SearchFieldWidgetProps> | null {
  return useMemo(() => {
    const override = overrides.find((o) => o.field === field);
    if (!override) return null;

    const loader = getWidget(override.widgetId);
    if (!loader) {
      console.warn(`Widget "${override.widgetId}" not found in registry. Falling back to default Input.`);
      return null;
    }

    return lazy(loader);
  }, [overrides, field]);
}
```

### 2.6 Refactored AutomationWizard

**File: `src/components/automations/AutomationWizard.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useTranslations } from "@/i18n";
import { getUserApiKeys } from "@/actions/apiKey.actions";
import { getActiveModules } from "@/actions/module.actions";
import type { ModuleManifestSummary } from "@/actions/module.actions";
import { ConnectorType } from "@/lib/connector/manifest";
import type { AutomationWithResume } from "@/models/automation.model";
import { useAutomationWizard } from "./useAutomationWizard";
import { WizardShell } from "./WizardShell";

interface Resume {
  id: string;
  title: string;
}

interface AutomationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumes: Resume[];
  onSuccess: () => void;
  editAutomation?: AutomationWithResume | null;
}

export function AutomationWizard({
  open,
  onOpenChange,
  resumes,
  onSuccess,
  editAutomation,
}: AutomationWizardProps) {
  const { t } = useTranslations();
  const [availableModules, setAvailableModules] = useState<ModuleManifestSummary[]>([]);
  const [configuredKeyModuleIds, setConfiguredKeyModuleIds] = useState<Set<string>>(new Set());

  // Fetch modules and API keys when dialog opens
  useEffect(() => {
    if (!open) return;
    getUserApiKeys().then((result) => {
      if (result.success && result.data) {
        setConfiguredKeyModuleIds(new Set(result.data.map((k) => k.moduleId)));
      }
    }).catch(() => setConfiguredKeyModuleIds(new Set()));

    getActiveModules(ConnectorType.JOB_DISCOVERY).then((result) => {
      if (result.success && result.data) {
        setAvailableModules(result.data);
      }
    }).catch(() => setAvailableModules([]));
  }, [open]);

  const wizard = useAutomationWizard({
    modules: availableModules,
    configuredKeyModuleIds,
    resumes,
    editAutomation,
    onSuccess,
    onClose: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={() => wizard.close()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {wizard.isEditing ? t("automations.editAutomation") : t("automations.createAutomation")}
          </DialogTitle>
          <DialogDescription>
            {t("automations.step")} {wizard.step + 1} {t("automations.of")} {wizard.steps.length}: {t(wizard.steps[wizard.step].descKey)}
          </DialogDescription>
        </DialogHeader>

        <Form {...wizard.form}>
          <form onSubmit={wizard.form.handleSubmit(() => wizard.submit())}>
            <div className="py-4">
              <WizardShell wizard={wizard} resumes={resumes} />
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

This is approximately 65 lines, down from 880.

### 2.7 i18n Strategy

**Label resolution function** (used inside DynamicParamsForm):

```typescript
function resolveLabel(t: (key: string) => string, i18nKey: string): string {
  const translated = t(i18nKey);
  // If t() returns the key itself, the translation is missing.
  // Fall back to the key's last segment as a human-readable label.
  if (translated === i18nKey) {
    const lastDot = i18nKey.lastIndexOf(".");
    return lastDot >= 0 ? i18nKey.slice(lastDot + 1) : i18nKey;
  }
  return translated;
}
```

**Option label resolution:**

```typescript
function resolveOptionLabel(
  t: (key: string) => string,
  moduleId: string,
  fieldKey: string,
  optionValue: string | number,
): string {
  // Convention: automations.paramOption.{moduleId}.{fieldKey}.{optionValue}
  const key = `automations.paramOption.${moduleId}.${fieldKey}.${String(optionValue)}`;
  const translated = t(key);
  // If not translated, display the raw option value (acceptable for codes like NACE sectors)
  return translated !== key ? translated : String(optionValue);
}
```

**i18n dictionary additions** (`src/i18n/dictionaries/automations.ts`):

All 4 locales (en, de, fr, es) get:

```typescript
// Section header
"automations.connectorParams": "Advanced Search Options",
"automations.addFilter": "Add filter...",

// Arbeitsagentur param labels
"automations.params.umkreis": "Radius (km)",
"automations.params.veroeffentlichtseit": "Published within (days)",
"automations.params.arbeitszeit": "Working time",
"automations.params.befristung": "Contract type",

// Arbeitsagentur option labels
"automations.paramOption.arbeitsagentur.arbeitszeit.vz": "Full-time",
"automations.paramOption.arbeitsagentur.arbeitszeit.tz": "Part-time",
"automations.paramOption.arbeitsagentur.arbeitszeit.snw": "Shift/Night/Weekend",
"automations.paramOption.arbeitsagentur.arbeitszeit.mj": "Mini-job",
"automations.paramOption.arbeitsagentur.arbeitszeit.ho": "Home office",
"automations.paramOption.arbeitsagentur.befristung.1": "Permanent",
"automations.paramOption.arbeitsagentur.befristung.2": "Temporary",

// EURES param labels
"automations.params.publicationPeriod": "Published within",
"automations.params.experienceLevel": "Experience level",
"automations.params.positionOffering": "Position type",
"automations.params.workingTime": "Working time",
"automations.params.educationLevel": "Education level",
"automations.params.sector": "Industry sector",
"automations.params.euresFlag": "EURES flag",
"automations.params.requiredLanguages": "Required languages",
"automations.params.sortOrder": "Sort order",

// EURES option labels (publicationPeriod)
"automations.paramOption.eures.publicationPeriod.LAST_DAY": "Last day",
"automations.paramOption.eures.publicationPeriod.LAST_THREE_DAYS": "Last 3 days",
"automations.paramOption.eures.publicationPeriod.LAST_WEEK": "Last week",
"automations.paramOption.eures.publicationPeriod.LAST_MONTH": "Last month",

// EURES option labels (sortSearch)
"automations.paramOption.eures.sortSearch.BEST_MATCH": "Best match",
"automations.paramOption.eures.sortSearch.MOST_RECENT": "Most recent",

// EURES option labels (experience, position, schedule, education, euresFlag)
// ... (full set for all 4 locales)
```

German example:

```typescript
"automations.connectorParams": "Erweiterte Suchoptionen",
"automations.params.umkreis": "Umkreis (km)",
"automations.params.veroeffentlichtseit": "Veröffentlicht innerhalb (Tage)",
"automations.params.arbeitszeit": "Arbeitszeit",
"automations.params.befristung": "Befristung",
"automations.paramOption.arbeitsagentur.arbeitszeit.vz": "Vollzeit",
"automations.paramOption.arbeitsagentur.arbeitszeit.tz": "Teilzeit",
"automations.paramOption.arbeitsagentur.arbeitszeit.snw": "Schicht/Nacht/Wochenende",
"automations.paramOption.arbeitsagentur.arbeitszeit.mj": "Minijob",
"automations.paramOption.arbeitsagentur.arbeitszeit.ho": "Homeoffice",
"automations.paramOption.arbeitsagentur.befristung.1": "Unbefristet",
"automations.paramOption.arbeitsagentur.befristung.2": "Befristet",
"automations.params.publicationPeriod": "Veröffentlicht innerhalb",
// ...etc
```

---

## 3. Data Flow

### 3.1 Server -> Client Manifest Transport

```
Server startup:
  eures/manifest.ts         ─┐
  arbeitsagentur/manifest.ts ├─ moduleRegistry.register(manifest, factory)
  jsearch/manifest.ts        ─┘

AutomationWizard opens:
  1. Client calls getActiveModules(ConnectorType.JOB_DISCOVERY)
  2. Server action reads moduleRegistry, builds ModuleManifestSummary[] DTO
     - Includes connectorParamsSchema (array of ConnectorParamField)
     - Includes searchFieldOverrides (array of SearchFieldOverride)
  3. DTO is serialized over RSC boundary (pure JSON, no Date objects)
  4. Client receives ModuleManifestSummary[] in state
```

### 3.2 User Interaction Flow

```
User selects module "arbeitsagentur":
  1. useAutomationWizard.selectModule("arbeitsagentur")
  2. Hook finds module in availableModules
  3. Hook reads connectorParamsSchema from summary
     -> Sets paramsSchema = [umkreis, veroeffentlichtseit, arbeitszeit, befristung]
  4. Hook reads searchFieldOverrides from summary
     -> Empty (no overrides) -> keywords/location use default Input
  5. Hook initializes connectorParamsValues with defaults:
     { umkreis: 25, veroeffentlichtseit: 7 }
  6. WizardShell re-renders SearchStep
     -> Keywords: <Input> (default)
     -> Location: <Input> (default)
     -> DynamicParamsForm: renders 4 fields

User changes to EURES:
  1. useAutomationWizard.selectModule("eures")
  2. Hook sets paramsSchema = [publicationPeriod, requiredExperienceCodes, ...]
  3. Hook sets searchFieldOverrides = [{keywords, eures-occupation}, {location, eures-location}]
  4. Hook resets connectorParamsValues to EURES defaults:
     { publicationPeriod: "LAST_WEEK", sortSearch: "MOST_RECENT" }
  5. WizardShell re-renders SearchStep
     -> Keywords: <EuresOccupationCombobox> (lazy-loaded via widget registry)
     -> Location: <EuresLocationCombobox> (lazy-loaded via widget registry)
     -> DynamicParamsForm: renders 9 fields (publicationPeriod, etc.)
```

### 3.3 Form Submission Flow

```
User clicks "Create Automation":
  1. react-hook-form validates via Zod (CreateAutomationSchema)
  2. Hook serializes connectorParamsValues + systemParams into connectorParams JSON string
  3. Hook adds scheduleFrequency to the form data
  4. Server action createAutomation() receives CreateAutomationInput
  5. Server validates:
     a. Zod schema (name, jobBoard as string, keywords, location, etc.)
     b. moduleRegistry.has(data.jobBoard) — exists check
     c. validateConnectorParams(data.jobBoard, parsedParams) — array-based validation
  6. Server creates Automation row in Prisma
     - connectorParams: JSON string (user params + system params)
     - scheduleFrequency: from form data (new column)
  7. Server returns ActionResult<{ id: string }>
```

---

## 4. Cross-Cutting Concerns

### 4.1 Backward Compatibility

**Existing automations:** The `connectorParams` JSON blob format does not change. Existing automations store their params as JSON and will continue to work. The validator now iterates an array instead of Object.entries, but the runtime behavior is equivalent for the same data.

**scheduleFrequency migration:** A Prisma migration adds the column with `@default("daily")`. All existing automations get `"daily"` as the default value. The migration script reads existing `connectorParams` JSON, extracts `scheduleFrequency`, writes it to the new column, and removes it from the JSON. The runner reads from the column first, falling back to the JSON blob for safety.

**Edit mode:** When editing an existing automation, the hook parses the stored `connectorParams` JSON and maps known schema keys to `connectorParamsValues`. Unknown keys (e.g., `scheduleFrequency` in old automations that haven't been migrated) are preserved in the JSON but not shown in the dynamic form.

**JobBoard type relaxation:** Changing `JobBoard` from a union literal to `string` is backward compatible. All existing assignments of `"jsearch"`, `"eures"`, `"arbeitsagentur"` remain valid strings.

### 4.2 Error Handling

| Error Scenario | Handling |
|---|---|
| Module not in registry | `moduleRegistry.has(jobBoard)` check in server action returns error before DB write |
| Invalid connectorParams | `validateConnectorParams()` returns `{ valid: false, errors }` -- shown to user via toast |
| Unknown widgetId in override | `getWidget()` returns undefined -- falls back to default `<Input>`. Console warning logged. |
| Unknown field type in schema | `DynamicField` returns `null` (graceful degradation). Field is silently skipped. |
| i18n key missing | `resolveLabel()` extracts last segment of key as fallback. `resolveOptionLabel()` shows raw option value. |
| Empty connectorParams JSON | Hook defaults to `{}` (all optional fields use their defaults) |
| Manifest with no schema | `DynamicParamsForm` receives empty array, returns null. "Advanced Search Options" header not rendered. |
| Widget lazy-load failure | React Suspense boundary catches the error. `<Input>` fallback is shown. Error logged. |

### 4.3 Empty States

- **Module with no connectorParamsSchema** (JSearch): The SearchStep renders only keywords + location inputs. No "Advanced Search Options" header. No empty container.
- **Module with no searchFieldOverrides** (JSearch, Arbeitsagentur): Keywords and location use default `<Input>` components. No widget loading.
- **Module with empty options array in a select**: The SelectContent renders empty. This should not happen in practice (manifests always declare options for select/multiselect types).
- **No available modules**: The module selector is empty. The "Next" button is disabled because no `jobBoard` is selected.

### 4.4 Testing Strategy

| Test | Type | File |
|---|---|---|
| `ConnectorParamField` array validation | Unit | `__tests__/params-validator.spec.ts` |
| multiselect validation (valid + invalid arrays) | Unit | `__tests__/params-validator.spec.ts` |
| min/max number validation | Unit | `__tests__/params-validator.spec.ts` |
| DynamicParamsForm renders 4 fields for Arbeitsagentur schema | Component | `__tests__/DynamicParamsForm.spec.tsx` |
| DynamicParamsForm renders nothing for empty schema | Component | `__tests__/DynamicParamsForm.spec.tsx` |
| MultiselectField add/remove items | Component | `__tests__/DynamicParamsForm.spec.tsx` |
| resolveLabel falls back for missing i18n key | Unit | `__tests__/DynamicParamsForm.spec.tsx` |
| resolveOptionLabel falls back to raw value | Unit | `__tests__/DynamicParamsForm.spec.tsx` |
| Widget registry returns correct loaders | Unit | `__tests__/widget-registry.spec.ts` |
| Widget registry returns undefined for unknown widgetId | Unit | `__tests__/widget-registry.spec.ts` |
| useAutomationWizard step navigation | Unit (hook) | `__tests__/useAutomationWizard.spec.ts` |
| useAutomationWizard module change resets params | Unit (hook) | `__tests__/useAutomationWizard.spec.ts` |
| useAutomationWizard edit mode populates params | Unit (hook) | `__tests__/useAutomationWizard.spec.ts` |
| i18n dictionary consistency (4 locales) | Validation | `bun run /tmp/test-dictionaries.ts` |
| Arbeitsagentur automation with dynamic fields | E2E | `e2e/crud/automation.spec.ts` |
| EURES automation with widget overrides | E2E | `e2e/crud/automation.spec.ts` |
| JSearch automation (no dynamic fields) | E2E | `e2e/crud/automation.spec.ts` |

---

## 5. Summary of Files Changed and Created

### New files:

| File | Purpose |
|---|---|
| `src/components/automations/useAutomationWizard.ts` | Headless wizard state machine hook |
| `src/components/automations/WizardShell.tsx` | Pure presentation shell |
| `src/components/automations/DynamicParamsForm.tsx` | Schema-driven form renderer |
| `src/components/automations/widget-registry.ts` | widgetId -> React component mapping |
| `src/components/automations/EuresOccupationWidgetAdapter.tsx` | Adapter for occupation combobox |
| `src/components/automations/EuresLocationWidgetAdapter.tsx` | Adapter for location combobox |
| `scripts/migrate-schedule-frequency.ts` | Data migration for scheduleFrequency column |
| `prisma/migrations/XXXXXX_add_schedule_frequency/` | Prisma migration |

### Modified files:

| File | Change |
|---|---|
| `src/lib/connector/manifest.ts` | ConnectorParamField, ConnectorParamsSchema, SearchFieldOverride, manifestVersion, automationType |
| `src/lib/connector/job-discovery/modules/eures/manifest.ts` | searchFieldOverrides, connectorParamsSchema (9 fields), manifestVersion |
| `src/lib/connector/job-discovery/modules/eures/index.ts` | Read params from connectorParams with defaults |
| `src/lib/connector/job-discovery/modules/arbeitsagentur/manifest.ts` | Array schema format, i18n labels, manifestVersion |
| `src/lib/connector/job-discovery/modules/jsearch/manifest.ts` | manifestVersion |
| `src/lib/connector/ai-provider/modules/ollama/manifest.ts` | manifestVersion |
| `src/lib/connector/ai-provider/modules/openai/manifest.ts` | manifestVersion |
| `src/lib/connector/ai-provider/modules/deepseek/manifest.ts` | manifestVersion |
| `src/lib/connector/params-validator.ts` | Array iteration, multiselect validation, min/max |
| `src/actions/module.actions.ts` | ModuleManifestSummary DTO extension |
| `src/models/automation.schema.ts` | Dynamic JobBoard, scheduleFrequency field |
| `src/models/automation.model.ts` | JobBoard as string, scheduleFrequency field |
| `src/lib/connector/job-discovery/runner.ts` | Read scheduleFrequency from column |
| `src/actions/automation.actions.ts` | Registry existence check for jobBoard |
| `src/components/automations/AutomationWizard.tsx` | Refactored to ~65 lines (hook + shell) |
| `prisma/schema.prisma` | scheduleFrequency column on Automation |
| `src/i18n/dictionaries/automations.ts` | Param labels + option labels (4 locales) |

### Unchanged files (verified compatible):

| File | Why |
|---|---|
| `src/components/ui/chip-list.tsx` | Not used directly by DynamicParamsForm (multiselect uses inline Badge pattern) |
| `src/components/automations/EuresOccupationCombobox.tsx` | Unchanged, accessed via adapter |
| `src/components/automations/EuresLocationCombobox.tsx` | Unchanged, accessed via adapter |
| `src/lib/connector/registry.ts` | No changes needed (manifest types are backward compatible) |
