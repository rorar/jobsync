"use client";

import React, { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useTranslations } from "@/i18n";
import type { ConnectorParamsSchema, ConnectorParamField } from "@/lib/connector/manifest";

// ---------------------------------------------------------------------------
// DynamicParamsForm — renders form fields from a ConnectorParamsSchema array
// ---------------------------------------------------------------------------

interface DynamicParamsFormProps {
  moduleId: string;
  schema: ConnectorParamsSchema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

/**
 * Dynamically renders form fields for module-specific connector parameters.
 * Only renders if schema has fields. Wraps in an "Advanced Search Options" section.
 */
export function DynamicParamsForm({
  moduleId,
  schema,
  values,
  onChange,
}: DynamicParamsFormProps) {
  const { t } = useTranslations();

  if (!schema || schema.length === 0) return null;

  return (
    <div className="space-y-4 pt-4 border-t">
      <h4 className="text-sm font-medium text-muted-foreground">
        {t("automations.connectorParams")}
      </h4>
      <div className="space-y-4">
        {schema.map((field) => (
          <DynamicField
            key={field.key}
            moduleId={moduleId}
            field={field}
            value={values[field.key]}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: single field renderer
// ---------------------------------------------------------------------------

interface DynamicFieldProps {
  moduleId: string;
  field: ConnectorParamField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

function DynamicField({ moduleId, field, value, onChange }: DynamicFieldProps) {
  const { t } = useTranslations();

  /** Resolve an i18n key with raw-string fallback. */
  const resolveLabel = useCallback(
    (key: string): string => {
      const translated = t(key as any);
      return translated !== key ? translated : key;
    },
    [t],
  );

  /** Resolve option label via i18n convention: automations.paramOption.{moduleId}.{fieldKey}.{value} */
  const resolveOptionLabel = useCallback(
    (optionValue: string | number): string => {
      const key = `automations.paramOption.${moduleId}.${field.key}.${optionValue}`;
      const translated = t(key as any);
      return translated !== key ? translated : String(optionValue);
    },
    [t, moduleId, field.key],
  );

  const displayLabel = resolveLabel(field.label);

  switch (field.type) {
    case "number":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={`param-${field.key}`} className="text-sm">
            {displayLabel}
          </Label>
          <Input
            id={`param-${field.key}`}
            type="number"
            min={field.min}
            max={field.max}
            placeholder={field.placeholder}
            value={value !== undefined && value !== null ? String(value) : ""}
            onChange={(e) => {
              const raw = e.target.value;
              onChange(field.key, raw === "" ? undefined : Number(raw));
            }}
          />
        </div>
      );

    case "string":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={`param-${field.key}`} className="text-sm">
            {displayLabel}
          </Label>
          <Input
            id={`param-${field.key}`}
            type="text"
            placeholder={field.placeholder}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(field.key, e.target.value || undefined)}
          />
        </div>
      );

    case "boolean":
      return (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label htmlFor={`param-${field.key}`} className="text-sm">
            {displayLabel}
          </Label>
          <Switch
            id={`param-${field.key}`}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(field.key, checked)}
          />
        </div>
      );

    case "select":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={`param-${field.key}`} className="text-sm">
            {displayLabel}
          </Label>
          <Select
            value={value !== undefined && value !== null ? String(value) : ""}
            onValueChange={(val) => {
              // Restore original type if options are numbers
              const numericOption = field.options?.find(
                (o) => typeof o === "number" && String(o) === val,
              );
              onChange(field.key, numericOption !== undefined ? numericOption : val);
            }}
          >
            <SelectTrigger id={`param-${field.key}`}>
              <SelectValue placeholder={displayLabel} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={String(opt)} value={String(opt)}>
                  {resolveOptionLabel(opt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case "multiselect":
      return (
        <MultiselectField
          field={field}
          value={value}
          onChange={onChange}
          displayLabel={displayLabel}
          resolveOptionLabel={resolveOptionLabel}
        />
      );

    case "language-proficiency":
      return (
        <LanguageProficiencyField
          field={field}
          value={value}
          onChange={onChange}
          displayLabel={displayLabel}
          t={t}
        />
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Internal: multiselect renderer using badge chips
// ---------------------------------------------------------------------------

interface MultiselectFieldProps {
  field: ConnectorParamField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  displayLabel: string;
  resolveOptionLabel: (opt: string | number) => string;
}

function MultiselectField({
  field,
  value,
  onChange,
  displayLabel,
  resolveOptionLabel,
}: MultiselectFieldProps) {
  // Normalize value to string array
  const selected: string[] = Array.isArray(value)
    ? value.map(String)
    : typeof value === "string" && value.length > 0
      ? value.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const toggle = (optValue: string) => {
    const next = selected.includes(optValue)
      ? selected.filter((v) => v !== optValue)
      : [...selected, optValue];
    onChange(field.key, next.length > 0 ? next : undefined);
  };

  const remove = (optValue: string) => {
    const next = selected.filter((v) => v !== optValue);
    onChange(field.key, next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{displayLabel}</Label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((val) => (
            <Badge key={val} variant="secondary" className="gap-1 pr-1">
              <span className="text-xs">{resolveOptionLabel(val)}</span>
              <button
                type="button"
                onClick={() => remove(val)}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Remove ${resolveOptionLabel(val)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Options dropdown */}
      <Select
        value=""
        onValueChange={(val) => toggle(val)}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              selected.length > 0
                ? `${selected.length} selected`
                : displayLabel
            }
          />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((opt) => {
            const optStr = String(opt);
            const isSelected = selected.includes(optStr);
            return (
              <SelectItem
                key={optStr}
                value={optStr}
                className={isSelected ? "font-medium" : ""}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`h-3.5 w-3.5 shrink-0 rounded-sm border flex items-center justify-center ${
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 10 10">
                        <path
                          d="M2 5L4 7L8 3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                        />
                      </svg>
                    )}
                  </span>
                  {resolveOptionLabel(opt)}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: language + CEFR proficiency level selector
// ---------------------------------------------------------------------------

/** ISO 639-1 codes for common European languages. */
const LANGUAGE_OPTIONS = [
  "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr",
  "ga", "hr", "hu", "it", "lt", "lv", "mt", "nl", "no", "pl",
  "pt", "ro", "sk", "sl", "sv",
] as const;

/** CEFR proficiency levels. */
const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/** Native language names for display in the selector. */
const LANGUAGE_NAMES: Record<string, string> = {
  bg: "Български (BG)", cs: "Čeština (CS)", da: "Dansk (DA)",
  de: "Deutsch (DE)", el: "Ελληνικά (EL)", en: "English (EN)",
  es: "Español (ES)", et: "Eesti (ET)", fi: "Suomi (FI)",
  fr: "Français (FR)", ga: "Gaeilge (GA)", hr: "Hrvatski (HR)",
  hu: "Magyar (HU)", it: "Italiano (IT)", lt: "Lietuvių (LT)",
  lv: "Latviešu (LV)", mt: "Malti (MT)", nl: "Nederlands (NL)",
  no: "Norsk (NO)", pl: "Polski (PL)", pt: "Português (PT)",
  ro: "Română (RO)", sk: "Slovenčina (SK)", sl: "Slovenščina (SL)",
  sv: "Svenska (SV)",
};

interface LanguageProficiencyFieldProps {
  field: ConnectorParamField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  displayLabel: string;
  t: (key: string) => string;
}

/**
 * Structured language + CEFR level selector.
 *
 * Replaces the old free-text input ("de(B2), en(C1)") with two dropdowns
 * + an add button + chip display. The serialized value is the same
 * comma-separated format the EURES API expects: "de(B2), en(C1)".
 */
function LanguageProficiencyField({
  field,
  value,
  onChange,
  displayLabel,
  t,
}: LanguageProficiencyFieldProps) {
  // Parse the serialized string into an array of { lang, level } pairs.
  const entries: { lang: string; level: string }[] = (() => {
    if (typeof value !== "string" || value.trim() === "") return [];
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const match = entry.match(/^([a-z]{2})\(([A-C][12])\)$/i);
        if (!match) return null;
        return { lang: match[1].toLowerCase(), level: match[2].toUpperCase() };
      })
      .filter((e): e is { lang: string; level: string } => e !== null);
  })();

  const serialize = (list: { lang: string; level: string }[]) =>
    list.length > 0
      ? list.map((e) => `${e.lang}(${e.level})`).join(", ")
      : undefined;

  const [pendingLang, setPendingLang] = React.useState("");
  const [pendingLevel, setPendingLevel] = React.useState("B2");

  const usedLanguages = new Set(entries.map((e) => e.lang));
  const availableLanguages = LANGUAGE_OPTIONS.filter(
    (l) => !usedLanguages.has(l),
  );

  const addEntry = () => {
    if (!pendingLang || !pendingLevel) return;
    const next = [...entries, { lang: pendingLang, level: pendingLevel }];
    onChange(field.key, serialize(next));
    setPendingLang("");
  };

  const removeEntry = (lang: string) => {
    const next = entries.filter((e) => e.lang !== lang);
    onChange(field.key, serialize(next));
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{displayLabel}</Label>

      {/* Selected language chips */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <Badge
              key={entry.lang}
              variant="secondary"
              className="gap-1.5 pr-1"
            >
              <span className="text-xs font-medium">
                {LANGUAGE_NAMES[entry.lang] ?? entry.lang.toUpperCase()} — {entry.level}
              </span>
              <button
                type="button"
                onClick={() => removeEntry(entry.lang)}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                aria-label={`${t("common.remove")} ${entry.lang.toUpperCase()} ${entry.level}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Add row: language select + level select + add button */}
      {availableLanguages.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={pendingLang} onValueChange={setPendingLang}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder={t("automations.params.selectLanguage")} />
            </SelectTrigger>
            <SelectContent>
              {availableLanguages.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {LANGUAGE_NAMES[lang] ?? lang.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={pendingLevel} onValueChange={setPendingLevel}>
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CEFR_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={addEntry}
            disabled={!pendingLang}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-3"
          >
            {t("common.add")}
          </button>
        </div>
      )}
    </div>
  );
}
