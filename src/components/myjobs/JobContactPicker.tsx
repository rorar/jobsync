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

export interface PersonOption {
  id: string;
  /** Display label, e.g. "First Last — primaryEmail" */
  label: string;
}

interface JobContactPickerProps {
  value: string;
  onValueChange: (personId: string) => void;
  persons: PersonOption[];
  disabled?: boolean;
  className?: string;
  /** Shows a spinner instead of the empty state while options load */
  loading?: boolean;
}

/**
 * Point-of-Contact person picker for the Add Job dialog (Welle 3, F-AJ-07).
 *
 * Select-existing only — inline person creation is intentionally out of scope
 * for the create dialog (a Person needs more than a single typed label; full
 * person creation lives on /contacts). Mirrors the CountrySelect pattern:
 * props-based options, cmdk `shouldFilter={false}` + manual filter so the clear
 * item stays visible, controlled inputValue reset on close, aria-live announce.
 */
export function JobContactPicker({
  value,
  onValueChange,
  persons,
  disabled,
  className,
  loading,
}: JobContactPickerProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const selectedPerson = useMemo(
    () => persons.find((p) => p.id === value),
    [persons, value],
  );

  const filtered = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return persons;
    return persons.filter((p) => p.label.toLowerCase().includes(q));
  }, [persons, inputValue]);

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
          aria-label={t("crm.selectContact")}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selectedPerson ? (
            <span className="truncate">{selectedPerson.label}</span>
          ) : (
            <span className="text-muted-foreground">{t("crm.selectContact")}</span>
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
            placeholder={t("crm.searchContacts")}
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
              <CommandEmpty>{t("crm.noContactsFound")}</CommandEmpty>
            )}
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onValueChange("");
                    setAnnouncement(t("crm.selectContact"));
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  — {t("crm.selectContact")}
                </CommandItem>
              )}
              {filtered.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.label} ${p.id}`}
                  onSelect={() => {
                    onValueChange(p.id);
                    setAnnouncement(`${p.label}: ${t("crm.contactSelected")}`);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{p.label}</span>
                  {p.id === value && <Check className="ml-2 h-4 w-4 shrink-0" />}
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
