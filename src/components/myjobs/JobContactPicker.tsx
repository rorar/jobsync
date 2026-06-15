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
import type { CompanyAssociation, TypedEmail } from "@/models/person.model";

/**
 * Two-tier option shape for the people-picker.
 *
 * - `name`       — primary line, the person's full name (the accessible label).
 * - `secondary`  — muted second line: the most task-relevant identifier
 *                  (role · company → company → primary email → ""). May be "".
 * - `searchText` — pre-lowercased haystack (name + emails + company labels +
 *                  roles) so the manual filter matches far more than the visible
 *                  label. Computed once in the AddJob mapping, not per keystroke.
 */
export interface PersonOption {
  id: string;
  name: string;
  secondary: string;
  searchText: string;
}

/**
 * Person fields needed to derive a {@link PersonOption}.
 *
 * `emails`/`companies` are the already-deserialized value objects — `getPersons`
 * (the Person repository) parses the JSON columns before returning, so the
 * picker never re-parses (DDD: deserialization is a repository concern).
 */
export interface PersonOptionSource {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  emails?: TypedEmail[] | null;
  companies?: CompanyAssociation[] | null;
}

/**
 * Derive the two-tier picker option from a Person.
 *
 * Company selection for the secondary line: the primary association if present,
 * else the first association that carries a role, else the first association.
 * Secondary-line priority: "role · company" → "company" → primary email → "".
 * Tolerant of null/missing collections (treated as empty).
 */
export function toPersonOption(src: PersonOptionSource): PersonOption {
  const name = `${src.firstName ?? ""} ${src.lastName ?? ""}`.trim();

  const companies = (src.companies ?? []).filter((c) => c.companyLabel);
  const emails = src.emails ?? [];
  const primaryEmail =
    emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email ?? "";

  const chosenCompany =
    companies.find((c) => c.isPrimary) ??
    companies.find((c) => (c.position ?? "").trim()) ??
    companies[0];

  let secondary = "";
  if (chosenCompany) {
    const position = (chosenCompany.position ?? "").trim();
    secondary = position
      ? `${position} · ${chosenCompany.companyLabel}`
      : chosenCompany.companyLabel;
  } else if (primaryEmail) {
    secondary = primaryEmail;
  }

  const searchParts = [
    name,
    ...emails.map((e) => e.email),
    ...companies.map((c) => c.companyLabel),
    ...companies.map((c) => c.position ?? ""),
  ].filter(Boolean);
  const searchText = searchParts.join(" ").toLowerCase();

  return { id: src.id, name, secondary, searchText };
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
 *
 * Each item is two-tier: the person's name (primary, the accessible label) over
 * a muted secondary identifier. The manual filter matches `searchText`, not the
 * visible label, so typing a company or role finds the person too.
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
    return persons.filter((p) => p.searchText.includes(q));
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
            <span className="truncate">{selectedPerson.name}</span>
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
                  // value keys off name+id (NOT the muted line) so cmdk
                  // type-ahead + uniqueness work even on duplicate names.
                  value={`${p.name} ${p.id}`}
                  onSelect={() => {
                    onValueChange(p.id);
                    setAnnouncement(`${p.name}: ${t("crm.contactSelected")}`);
                    setOpen(false);
                  }}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{p.name}</span>
                    {p.secondary && (
                      <span
                        data-testid="contact-option-secondary"
                        className="truncate text-xs text-muted-foreground"
                      >
                        {p.secondary}
                      </span>
                    )}
                  </span>
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
