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

/**
 * Locally-declared option shape (mirrors the server-side `CurrencyInfo` from the
 * CUR reference module). Declared here — not imported — so this client component
 * never pulls in the `server-only` currency module. `minorUnit` is carried for
 * downstream salary formatting and is intentionally NOT rendered (per ADR-034 /
 * the ui-design review: showing "2" next to EUR would confuse users).
 */
export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
  minorUnit: number;
}

interface CurrencySelectProps {
  value: string;
  onValueChange: (code: string) => void;
  currencies: CurrencyOption[];
  disabled?: boolean;
  className?: string;
  /** Shows a spinner instead of the empty state while options load */
  loading?: boolean;
}

/**
 * CurrencySelect — combobox over ISO-4217 currencies. Mirrors CountrySelect
 * (Popover + Command, shouldFilter=false manual filter, controlled inputValue
 * reset on close + Tab, aria-live announcement, loading spinner). Differences:
 * no flag image (a fixed-width muted symbol glyph instead); CODE is the
 * emphasized, unambiguous identity (the symbol alone is non-unique, e.g. $ →
 * USD/CAD/AUD); the filter also matches the symbol; an exact code match ranks first.
 */
export function CurrencySelect({
  value,
  onValueChange,
  currencies,
  disabled,
  className,
  loading,
}: CurrencySelectProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const selected = useMemo(
    () => currencies.find((c) => c.code === value),
    [currencies, value],
  );

  // Manual filtering (shouldFilter={false}) so the clear item stays visible
  // during search. Match code | name (diacritic-folded) | exact symbol. Rank:
  // exact-code (0) → code-prefix (1) → name (2) → symbol-only (3) so typing a
  // code surfaces that currency first.
  const filtered = useMemo(() => {
    const raw = inputValue.trim();
    if (!raw) return currencies;
    const q = foldDiacritics(raw);
    const ranked: Array<{ c: CurrencyOption; rank: number }> = [];
    for (const c of currencies) {
      const code = c.code.toLowerCase();
      const name = foldDiacritics(c.name);
      let rank = -1;
      if (code === q) rank = 0;
      else if (code.startsWith(q)) rank = 1;
      else if (name.includes(q)) rank = 2;
      else if (c.symbol === raw) rank = 3;
      if (rank >= 0) ranked.push({ c, rank });
    }
    ranked.sort((a, b) => a.rank - b.rank || a.c.code.localeCompare(b.c.code));
    return ranked.map((r) => r.c);
  }, [currencies, inputValue]);

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
          aria-label={t("crm.currencySelect")}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span aria-hidden="true" className="text-muted-foreground">
                {selected.symbol}
              </span>
              <span className="font-medium">{selected.code}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t("crm.currencySelect")}
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
            placeholder={t("crm.currencySearch")}
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
              <CommandEmpty>{t("crm.noCurrencyFound")}</CommandEmpty>
            )}
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onValueChange("");
                    setAnnouncement(t("crm.currencySelect"));
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  — {t("crm.currencySelect")}
                </CommandItem>
              )}
              {filtered.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.code} ${c.name}`}
                  onSelect={() => {
                    onValueChange(c.code);
                    setAnnouncement(c.name);
                    setOpen(false);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="mr-2 w-6 shrink-0 text-center tabular-nums text-muted-foreground"
                  >
                    {c.symbol}
                  </span>
                  <span className="font-medium">{c.code}</span>
                  <span className="ml-2 flex-1 truncate text-muted-foreground">
                    {c.name}
                  </span>
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
