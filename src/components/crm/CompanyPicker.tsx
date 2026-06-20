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
import { cn } from "@/lib/utils";

/** Minimal company option (select-existing). */
export interface CompanyOption {
  id: string;
  label: string;
}

interface CompanyPickerProps {
  value: string;
  onValueChange: (companyId: string) => void;
  companies: CompanyOption[];
  disabled?: boolean;
  className?: string;
  /** Spinner instead of the empty state while options load. */
  loading?: boolean;
  /** Trigger/clear copy (defaults to a generic "select company"). */
  placeholderKey?: string;
  ariaLabelKey?: string;
  searchPlaceholderKey?: string;
  emptyKey?: string;
}

/**
 * Reusable select-existing company picker (CRM context).
 *
 * Mirrors {@link ContactPicker}: props-based options, cmdk
 * `shouldFilter={false}` + manual filter so the clear item stays visible,
 * controlled inputValue reset on close, aria-live announce. Select-existing
 * only — inline company creation (the AddJob create-on-type flow) is a
 * deliberate follow-up; companies are created via the Job/CRM flows.
 */
export function CompanyPicker({
  value,
  onValueChange,
  companies,
  disabled,
  className,
  loading,
  placeholderKey = "insideTrack.tipCapture.companyPlaceholder",
  ariaLabelKey = "insideTrack.tipCapture.companyLabel",
  searchPlaceholderKey = "insideTrack.tipCapture.companySearchPlaceholder",
  emptyKey = "insideTrack.tipCapture.companyNoneFound",
}: CompanyPickerProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const selected = useMemo(
    () => companies.find((c) => c.id === value),
    [companies, value],
  );

  const filtered = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.label.toLowerCase().includes(q));
  }, [companies, inputValue]);

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
          aria-label={t(ariaLabelKey)}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected ? (
            <span className="truncate">{selected.label}</span>
          ) : (
            <span className="text-muted-foreground">{t(placeholderKey)}</span>
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
            placeholder={t(searchPlaceholderKey)}
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
              <CommandEmpty>{t(emptyKey)}</CommandEmpty>
            )}
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onValueChange("");
                    setAnnouncement(t(placeholderKey));
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  — {t(placeholderKey)}
                </CommandItem>
              )}
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.label} ${c.id}`}
                  onSelect={() => {
                    onValueChange(c.id);
                    setAnnouncement(c.label);
                    setOpen(false);
                  }}
                >
                  <span className="truncate flex-1">{c.label}</span>
                  {c.id === value && <Check className="ml-2 h-4 w-4 shrink-0" />}
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
