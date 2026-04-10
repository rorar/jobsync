"use client";

import { Minimize2, Maximize2 } from "lucide-react";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import type { StagingLayoutSize } from "@/hooks/useStagingLayout";

interface StagingLayoutToggleProps {
  value: StagingLayoutSize;
  onChange: (size: StagingLayoutSize) => void;
}

/**
 * Single toggle button for switching staging layout width.
 *
 * Cycles between "compact" (narrow, max-w-3xl) and "comfortable" (wide,
 * max-w-7xl). The previous three-option ToolbarRadioGroup
 * (compact / default / comfortable) was confusing — users expected a
 * single enlarge/minimize toggle. The "default" size (max-w-5xl) is
 * still valid at the hook level for backward compatibility with
 * persisted localStorage values, but the toggle UI no longer exposes it.
 * If the current persisted value is "default", the first click moves to
 * "comfortable" (enlarging); the next click moves to "compact".
 */
export function StagingLayoutToggle({ value, onChange }: StagingLayoutToggleProps) {
  const { t } = useTranslations();

  const isExpanded = value === "comfortable";

  const handleToggle = () => {
    // Cycle: compact|default → comfortable → compact
    onChange(isExpanded ? "compact" : "comfortable");
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      aria-label={
        isExpanded
          ? t("staging.layoutSize.compact")
          : t("staging.layoutSize.comfortable")
      }
      data-testid="staging-layout-toggle"
    >
      {isExpanded ? (
        <Minimize2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
