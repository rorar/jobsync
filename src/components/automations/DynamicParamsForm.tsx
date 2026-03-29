"use client";

import { useCallback } from "react";
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
