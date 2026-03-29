"use client";

import type { ComponentType } from "react";
import type { ControllerRenderProps } from "react-hook-form";
import type { CreateAutomationInput } from "@/models/automation.schema";
import dynamic from "next/dynamic";

// P-2.1: Lazy-load EURES widgets to avoid bundling 20-40KB when not needed
const EuresOccupationWidget = dynamic(() =>
  import("@/components/automations/EuresOccupationCombobox").then(m => ({ default: m.EuresOccupationCombobox }))
);
const EuresLocationWidget = dynamic(() =>
  import("@/components/automations/EuresLocationCombobox").then(m => ({ default: m.EuresLocationCombobox }))
);

// ---------------------------------------------------------------------------
// Widget Registry — maps widgetId strings from SearchFieldOverride to React
// components that replace the default keyword/location inputs.
// ---------------------------------------------------------------------------

/**
 * Props interface for keyword field widgets.
 * Must match EuresOccupationCombobox props shape.
 */
export interface KeywordsWidgetProps {
  field: ControllerRenderProps<CreateAutomationInput, "keywords">;
  language?: string;
}

/**
 * Props interface for location field widgets.
 * Must match EuresLocationCombobox props shape.
 */
export interface LocationWidgetProps {
  field: ControllerRenderProps<CreateAutomationInput, "location">;
}

/** Union of all supported widget prop shapes. */
export type SearchFieldWidgetProps = KeywordsWidgetProps | LocationWidgetProps;

interface WidgetRegistryEntry {
  field: "keywords" | "location";
  component: ComponentType<any>;
}

const WIDGET_REGISTRY: Record<string, WidgetRegistryEntry> = {
  "eures-occupation": {
    field: "keywords",
    component: EuresOccupationWidget,
  },
  "eures-location": {
    field: "location",
    component: EuresLocationWidget,
  },
};

/**
 * Look up a widget component by its widgetId.
 * Returns the React component, or null if the widgetId is unknown.
 */
export function getSearchFieldWidget(
  widgetId: string,
): ComponentType<any> | null {
  return WIDGET_REGISTRY[widgetId]?.component ?? null;
}

/**
 * Given a list of SearchFieldOverride entries, return a map of
 * field name -> component for quick lookup in the wizard shell.
 */
export function resolveWidgetOverrides(
  overrides?: { field: "keywords" | "location"; widgetId: string }[],
): Record<string, ComponentType<any>> {
  if (!overrides) return {};
  const result: Record<string, ComponentType<any>> = {};
  for (const override of overrides) {
    const entry = WIDGET_REGISTRY[override.widgetId];
    if (entry) {
      result[override.field] = entry.component;
    }
  }
  return result;
}
