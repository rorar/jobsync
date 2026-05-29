"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Check, Loader2 } from "lucide-react";
import Image from "next/image";
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

export interface CountryOption {
  code: string;
  name: string;
  hasSubdivisions: boolean;
}

interface CountrySelectProps {
  value: string;
  onValueChange: (code: string) => void;
  countries: CountryOption[];
  disabled?: boolean;
  className?: string;
  /** Shows a spinner instead of the empty state while options load */
  loading?: boolean;
}

/** Flag component with error fallback */
function CountryFlag({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  if (hasError || !code) return null;
  return (
    <Image
      src={`/flags/${code.toLowerCase()}.svg`}
      alt=""
      aria-hidden="true"
      className={cn("inline-block shrink-0 rounded-sm", className)}
      width={16}
      height={16}
      onError={() => setHasError(true)}
    />
  );
}

export function CountrySelect({
  value,
  onValueChange,
  countries,
  disabled,
  className,
  loading,
}: CountrySelectProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const selectedCountry = useMemo(
    () => countries.find((c) => c.code === value),
    [countries, value],
  );

  // Manual filtering (shouldFilter={false}) so the clear item stays visible
  // during search and we control the result set (matches EuresLocationCombobox).
  // Diacritic-insensitive: "osterreich" matches "Österreich", "mexico" → "México".
  const filtered = useMemo(() => {
    const q = foldDiacritics(inputValue.trim());
    if (!q) return countries;
    return countries.filter(
      (c) => foldDiacritics(c.name).includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [countries, inputValue]);

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
          aria-label={t("crm.countrySelect")}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selectedCountry ? (
            <span className="flex items-center gap-2 truncate">
              <CountryFlag code={selectedCountry.code} />
              {selectedCountry.name}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t("crm.countrySelect")}
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
            placeholder={t("crm.countrySearch")}
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
              <CommandEmpty>{t("crm.noCountryFound")}</CommandEmpty>
            )}
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onValueChange("");
                    setAnnouncement(t("crm.countrySelect"));
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  — {t("crm.countrySelect")}
                </CommandItem>
              )}
              {filtered.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.name} ${c.code}`}
                  onSelect={() => {
                    onValueChange(c.code);
                    setAnnouncement(c.name);
                    setOpen(false);
                  }}
                >
                  <CountryFlag code={c.code} className="mr-2" />
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.code === value && (
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
