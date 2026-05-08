"use client";

import React, { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import { ChevronsUpDown, Check, Loader2, X } from "lucide-react";

import type { ConnectorParamField } from "@/lib/connector/manifest";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const CEFR_SET = new Set<string>(CEFR_LEVELS);
const MAX_LANGUAGES = 10;

const LANG_TO_COUNTRY_FLAG: Record<string, string> = {
  bg: "bg", cs: "cz", da: "dk", de: "de", el: "gr", en: "gb", es: "es",
  et: "ee", fi: "fi", fr: "fr", ga: "ie", hr: "hr", hu: "hu", is: "is",
  it: "it", lt: "lt", lv: "lv", mt: "mt", nl: "nl", no: "no", pl: "pl",
  pt: "pt", ro: "ro", sk: "sk", sl: "si", sv: "se",
};

// ---------------------------------------------------------------------------
// LanguageFlag
// ---------------------------------------------------------------------------

function LanguageFlag({ langCode, className }: { langCode: string; className?: string }) {
  const countryCode = LANG_TO_COUNTRY_FLAG[langCode.toLowerCase()];
  const [hasError, setHasError] = React.useState(false);

  if (!countryCode || hasError) {
    return (
      <span
        className={`inline-block shrink-0 rounded-full bg-muted ${className ?? ""}`}
        style={{ width: 16, height: 16 }}
      />
    );
  }

  return (
    <Image
      src={`/flags/${countryCode}.svg`}
      alt={countryCode.toUpperCase()}
      className={`inline-block shrink-0 ${className ?? ""}`}
      width={16}
      height={16}
      onError={() => setHasError(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Types & data hook
// ---------------------------------------------------------------------------

interface EuresLanguage {
  id: number;
  isoCode: string;
  label: string;
}

function useEuresLanguages(): { languages: EuresLanguage[]; isLoading: boolean } {
  const [languages, setLanguages] = React.useState<EuresLanguage[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/eures/languages")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => {
        if (!cancelled && Array.isArray(data)) {
          setLanguages(
            data.filter(
              (d): d is EuresLanguage =>
                typeof d === "object" &&
                d !== null &&
                typeof (d as any).isoCode === "string" &&
                typeof (d as any).id === "number",
            ),
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { languages, isLoading };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EuresLanguageComboboxProps {
  field: ConnectorParamField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EuresLanguageCombobox({ field, value, onChange }: EuresLanguageComboboxProps) {
  const { t, locale } = useTranslations();
  const { languages: allLanguages, isLoading } = useEuresLanguages();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [announcement, setAnnouncement] = useState("");

  // Parse serialized "de(B2), en(C1)" format
  const entries: { lang: string; level: string }[] = useMemo(() => {
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
  }, [value]);

  const serialize = useCallback(
    (list: { lang: string; level: string }[]) =>
      list.length > 0
        ? list.map((e) => `${e.lang}(${e.level})`).join(", ")
        : undefined,
    [],
  );

  const usedLanguages = useMemo(() => new Set(entries.map((e) => e.lang)), [entries]);
  const selectedLevelMap = useMemo(() => new Map(entries.map((e) => [e.lang, e.level])), [entries]);
  const isMaxReached = entries.length >= MAX_LANGUAGES;

  // Pre-compute locale-aware display names once (not per keystroke)
  const displayNameMap = useMemo(() => {
    let dn: Intl.DisplayNames | null = null;
    try {
      dn = new Intl.DisplayNames([locale], { type: "language" });
    } catch { /* fallback to ISO codes */ }

    const map = new Map<string, string>();
    for (const lang of allLanguages) {
      const localized = dn?.of(lang.isoCode);
      const capitalized = localized
        ? localized.charAt(0).toUpperCase() + localized.slice(1)
        : null;
      map.set(
        lang.isoCode,
        capitalized ? `${capitalized} (${lang.isoCode.toUpperCase()})` : lang.isoCode.toUpperCase(),
      );
    }
    return map;
  }, [allLanguages, locale]);

  const getDisplayName = useCallback(
    (isoCode: string) => displayNameMap.get(isoCode) ?? isoCode.toUpperCase(),
    [displayNameMap],
  );

  // Filter languages by search input — O(1) lookup per language via displayNameMap
  const filtered = useMemo(() => {
    if (!inputValue) return allLanguages;
    const q = inputValue.toLowerCase();
    return allLanguages.filter((lang) => {
      const displayName = displayNameMap.get(lang.isoCode)?.toLowerCase() ?? "";
      return (
        lang.isoCode.toLowerCase().includes(q) ||
        lang.label.toLowerCase().includes(q) ||
        displayName.includes(q)
      );
    });
  }, [allLanguages, inputValue, displayNameMap]);

  const addLanguage = useCallback(
    (isoCode: string, level: string) => {
      if (!CEFR_SET.has(level)) return;
      if (usedLanguages.has(isoCode) || isMaxReached) {
        if (isMaxReached) {
          setAnnouncement(
            t("automations.maxLanguages" as any).replace("{max}", String(MAX_LANGUAGES)),
          );
        }
        return;
      }
      const next = [...entries, { lang: isoCode, level }];
      onChange(field.key, serialize(next));
      setAnnouncement(
        `${getDisplayName(isoCode)} ${t("automations.languagesSelected" as any).replace("{count}", String(next.length))}`,
      );
    },
    [entries, field.key, getDisplayName, isMaxReached, onChange, serialize, t, usedLanguages],
  );

  const removeEntry = useCallback(
    (lang: string) => {
      const next = entries.filter((e) => e.lang !== lang);
      onChange(field.key, serialize(next));
    },
    [entries, field.key, onChange, serialize],
  );

  const updateLevel = useCallback(
    (lang: string, newLevel: string) => {
      if (!CEFR_SET.has(newLevel)) return;
      const next = entries.map((e) =>
        e.lang === lang ? { ...e, level: newLevel } : e,
      );
      onChange(field.key, serialize(next));
    },
    [entries, field.key, onChange, serialize],
  );

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) setInputValue("");
      }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between font-normal",
              isMaxReached && "opacity-50 cursor-not-allowed",
            )}
            disabled={isMaxReached}
            type="button"
          >
            {isMaxReached
              ? t("automations.maxLanguages" as any).replace("{max}", String(MAX_LANGUAGES))
              : entries.length > 0
                ? t("automations.languagesSelected" as any).replace("{count}", String(entries.length))
                : t("automations.params.selectLanguage" as any)}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t("automations.searchLanguages" as any)}
              value={inputValue}
              onValueChange={setInputValue}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  setOpen(false);
                  setInputValue("");
                }
              }}
            />
            <CommandList>
              {isLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-muted-foreground" />
                </div>
              )}
              {!isLoading && filtered.length === 0 && (
                <CommandEmpty>{t("automations.noLanguagesFound" as any)}</CommandEmpty>
              )}
              {!isLoading &&
                filtered.map((lang) => {
                  const isUsed = usedLanguages.has(lang.isoCode);
                  return (
                    <CommandGroup key={lang.isoCode}>
                      {/* Language group header (non-selectable) */}
                      <CommandItem disabled className="flex items-center gap-2 opacity-70 cursor-default">
                        <LanguageFlag langCode={lang.isoCode} className="h-4 w-4 rounded-sm" />
                        <span className="font-medium flex-1">
                          {getDisplayName(lang.isoCode)}
                        </span>
                        {isUsed && (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        )}
                      </CommandItem>

                      {/* CEFR level items */}
                      {CEFR_LEVELS.map((level) => {
                        const isSelected = isUsed && selectedLevelMap.get(lang.isoCode) === level;
                        return (
                          <CommandItem
                            key={`${lang.isoCode}-${level}`}
                            onSelect={() => {
                              if (isUsed) {
                                // Language already added — update its level
                                updateLevel(lang.isoCode, level);
                              } else {
                                addLanguage(lang.isoCode, level);
                              }
                            }}
                            className={cn(
                              "flex items-center gap-2 pl-8",
                              isSelected && "bg-accent",
                            )}
                          >
                            <span className="flex-1 text-sm">
                              {t(`automations.cefrLevel.${level}` as any)}
                            </span>
                            {isSelected && (
                              <Check className="h-3.5 w-3.5 text-primary" />
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  );
                })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected language entries with inline CEFR level picker */}
      {entries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <div
              key={entry.lang}
              className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm animate-in fade-in-50 slide-in-from-left-2 duration-200"
            >
              <LanguageFlag langCode={entry.lang} className="h-4 w-4 rounded-sm shrink-0" />
              <span className="font-medium flex-1 truncate">
                {getDisplayName(entry.lang)}
              </span>
              <Select
                value={entry.level}
                onValueChange={(val) => updateLevel(entry.lang, val)}
              >
                <SelectTrigger className="h-7 w-auto min-w-[68px] text-xs px-2 border-dashed">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CEFR_LEVELS.map((level) => (
                    <SelectItem key={level} value={level} className="text-xs">
                      {t(`automations.cefrLevel.${level}` as any)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => removeEntry(entry.lang)}
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label={`${t("common.remove" as any)} ${getDisplayName(entry.lang)}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hint text when empty */}
      {entries.length === 0 && allLanguages.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("automations.selectCefrLevel" as any)}
        </p>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
