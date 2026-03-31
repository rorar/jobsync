"use client";

import { List, Layers } from "lucide-react";
import { useTranslations } from "@/i18n";

export type ViewMode = "list" | "deck";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const STORAGE_KEY = "jobsync-staging-view-mode";

export function getPersistedViewMode(): ViewMode {
  if (typeof window === "undefined") return "list";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "deck" ? "deck" : "list";
}

export function persistViewMode(mode: ViewMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
}

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  const { t } = useTranslations();

  return (
    <div className="inline-flex items-center rounded-md border border-input bg-background p-0.5" role="radiogroup" aria-label={t("deck.viewModeList")}>
      <button
        type="button"
        role="radio"
        aria-checked={value === "list"}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
          value === "list"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
        onClick={() => {
          onChange("list");
          persistViewMode("list");
        }}
      >
        <List className="h-3.5 w-3.5" />
        {t("deck.viewModeList")}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "deck"}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
          value === "deck"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
        onClick={() => {
          onChange("deck");
          persistViewMode("deck");
        }}
      >
        <Layers className="h-3.5 w-3.5" />
        {t("deck.viewModeDeck")}
      </button>
    </div>
  );
}
