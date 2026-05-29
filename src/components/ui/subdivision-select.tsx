"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Check, Loader2 } from "lucide-react";
import { useTranslations } from "@/i18n";
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
import { cn, foldDiacritics } from "@/lib/utils";

export interface SubdivisionOption {
  code: string;
  name: string;
  subdivisionType: string | null;
}

interface SubdivisionSelectProps {
  value: string;
  onValueChange: (code: string) => void;
  subdivisions: SubdivisionOption[];
  disabled?: boolean;
  className?: string;
  /** Shows a spinner instead of the empty state while options load */
  loading?: boolean;
}

export function SubdivisionSelect({
  value,
  onValueChange,
  subdivisions,
  disabled,
  className,
  loading,
}: SubdivisionSelectProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const selectedSub = useMemo(
    () => subdivisions.find((s) => s.code === value),
    [subdivisions, value],
  );

  // Manual filtering (shouldFilter={false}) so the clear item stays visible
  // during search (matches EuresLocationCombobox pattern).
  // Diacritic-insensitive: "zurich" matches "Zürich".
  const filtered = useMemo(() => {
    const q = foldDiacritics(inputValue.trim());
    if (!q) return subdivisions;
    return subdivisions.filter(
      (s) => foldDiacritics(s.name).includes(q) || s.code.toLowerCase().includes(q),
    );
  }, [subdivisions, inputValue]);

  if (subdivisions.length === 0 && !loading) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) setInputValue("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={t("crm.subdivisionSelect")}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selectedSub ? (
            <span className="truncate">{selectedSub.name}</span>
          ) : (
            <span className="text-muted-foreground">
              {t("crm.subdivisionSelect")}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("crm.subdivisionSearch")}
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
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-muted-foreground" />
              </div>
            ) : (
              <CommandEmpty>{t("crm.noSubdivisionFound")}</CommandEmpty>
            )}
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onValueChange("");
                    setAnnouncement(t("crm.subdivisionSelect"));
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  — {t("crm.subdivisionSelect")}
                </CommandItem>
              )}
              {filtered.map((s) => (
                <CommandItem
                  key={s.code}
                  value={`${s.name} ${s.code}`}
                  onSelect={() => {
                    onValueChange(s.code);
                    setAnnouncement(s.name);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.code === value && (
                    <Check className="ml-2 h-4 w-4 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </Popover>
  );
}
