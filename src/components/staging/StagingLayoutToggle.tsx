"use client";

import { useRef } from "react";
import { Minimize2, LayoutGrid, Maximize2, Check } from "lucide-react";
import { useTranslations } from "@/i18n";
import type { StagingLayoutSize } from "@/hooks/useStagingLayout";

interface StagingLayoutToggleProps {
  value: StagingLayoutSize;
  onChange: (size: StagingLayoutSize) => void;
}

const ORDER: StagingLayoutSize[] = ["compact", "default", "comfortable"];

export function StagingLayoutToggle({ value, onChange }: StagingLayoutToggleProps) {
  const { t } = useTranslations();
  const compactRef = useRef<HTMLButtonElement>(null);
  const defaultRef = useRef<HTMLButtonElement>(null);
  const comfortableRef = useRef<HTMLButtonElement>(null);

  const focusSize = (size: StagingLayoutSize) => {
    if (size === "compact") compactRef.current?.focus();
    else if (size === "default") defaultRef.current?.focus();
    else comfortableRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight" &&
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown"
    ) {
      return;
    }
    e.preventDefault();
    const currentIndex = ORDER.indexOf(value);
    const delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
    const nextIndex = (currentIndex + delta + ORDER.length) % ORDER.length;
    const nextValue = ORDER[nextIndex];
    onChange(nextValue);
    focusSize(nextValue);
  };

  // The active state uses TWO signals to satisfy WCAG 1.4.1 (Use of Color):
  //   1. Background color change (bg-primary).
  //   2. A small Check glyph overlaid in the top-right corner of the button.
  // The Check is absolutely positioned so it never changes layout dimensions
  // or causes reflow in the toolbar. It is aria-hidden because the
  // aria-checked state already conveys selection to assistive technology.
  const buttonClass = (active: boolean) =>
    `relative inline-flex items-center justify-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
      active
        ? "bg-primary text-primary-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground hover:bg-accent"
    }`;

  const labelCompact = t("staging.layoutSize.compact");
  const labelDefault = t("staging.layoutSize.default");
  const labelComfortable = t("staging.layoutSize.comfortable");

  const activeCheck = (
    <Check
      className="pointer-events-none absolute right-0.5 top-0.5 h-2.5 w-2.5 stroke-[3]"
      aria-hidden="true"
      data-testid="staging-layout-active-indicator"
    />
  );

  return (
    <div
      className="inline-flex items-center rounded-md border border-input bg-background p-0.5"
      role="radiogroup"
      aria-label={t("staging.layoutSize.label")}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={compactRef}
        type="button"
        role="radio"
        aria-checked={value === "compact"}
        aria-label={labelCompact}
        tabIndex={value === "compact" ? 0 : -1}
        className={buttonClass(value === "compact")}
        onClick={() => onChange("compact")}
      >
        <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
        {value === "compact" && activeCheck}
      </button>
      <button
        ref={defaultRef}
        type="button"
        role="radio"
        aria-checked={value === "default"}
        aria-label={labelDefault}
        tabIndex={value === "default" ? 0 : -1}
        className={buttonClass(value === "default")}
        onClick={() => onChange("default")}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
        {value === "default" && activeCheck}
      </button>
      <button
        ref={comfortableRef}
        type="button"
        role="radio"
        aria-checked={value === "comfortable"}
        aria-label={labelComfortable}
        tabIndex={value === "comfortable" ? 0 : -1}
        className={buttonClass(value === "comfortable")}
        onClick={() => onChange("comfortable")}
      >
        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        {value === "comfortable" && activeCheck}
      </button>
    </div>
  );
}
