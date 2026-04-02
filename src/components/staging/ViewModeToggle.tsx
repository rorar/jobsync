"use client";

import { useRef } from "react";
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
  const listRef = useRef<HTMLButtonElement>(null);
  const deckRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const newValue = value === "list" ? "deck" : "list";
      onChange(newValue);
      persistViewMode(newValue);
      if (newValue === "list") listRef.current?.focus();
      else deckRef.current?.focus();
    }
  };

  return (
    <div className="inline-flex items-center rounded-md border border-input bg-background p-0.5" role="radiogroup" aria-label={t("deck.viewModeLabel")} onKeyDown={handleKeyDown}>
      <button
        ref={listRef}
        type="button"
        role="radio"
        aria-checked={value === "list"}
        tabIndex={value === "list" ? 0 : -1}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
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
        ref={deckRef}
        type="button"
        role="radio"
        aria-checked={value === "deck"}
        tabIndex={value === "deck" ? 0 : -1}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
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
