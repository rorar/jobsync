"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Check, Loader2, CirclePlus } from "lucide-react";
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
  /**
   * Opt-in inline creation. When provided, an unmatched search term offers a
   * "create" item. The parent resolves it to a {@link CompanyOption} (and is
   * responsible for adding that option to `companies` BEFORE resolving, so the
   * trigger can render the new label immediately). Resolve `null` to signal
   * failure — the popover stays open and nothing is selected; the parent owns
   * the error toast.
   */
  onCreate?: (name: string) => Promise<CompanyOption | null>;
  createLabelKey?: string;
  creatingLabelKey?: string;
  /** Id of an element describing this control (wired as aria-describedby). */
  describedById?: string;
}

/**
 * Reusable select-existing company picker (CRM context).
 *
 * Mirrors {@link ContactPicker}: props-based options, cmdk
 * `shouldFilter={false}` + manual filter so the clear item stays visible,
 * controlled inputValue reset on close, aria-live announce.
 *
 * Select-existing by default. Passing `onCreate` additionally enables inline
 * creation, mirroring the AddJob create-on-type flow (`src/components/ComboBox.tsx`).
 * Consumers that omit `onCreate` (e.g. TipCaptureForm) are unaffected.
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
  onCreate,
  createLabelKey = "crm.createCompany",
  creatingLabelKey = "crm.creatingCompany",
  describedById,
}: CompanyPickerProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = useMemo(
    () => companies.find((c) => c.id === value),
    [companies, value],
  );

  const filtered = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.label.toLowerCase().includes(q));
  }, [companies, inputValue]);

  const query = inputValue.trim();

  /**
   * Offer creation only for a non-empty term that does not already name an
   * existing company (case-insensitive). Matching against the FULL list, not
   * `filtered`, so a term that is a substring match but an exact-name miss
   * still can't produce a duplicate.
   */
  const canCreate =
    !!onCreate &&
    query.length > 0 &&
    !companies.some((c) => c.label.toLowerCase() === query.toLowerCase());

  const handleCreate = async () => {
    if (!onCreate || creating || !query) return;
    setCreating(true);
    setAnnouncement(t(creatingLabelKey));
    try {
      const created = await onCreate(query);
      if (created) {
        onValueChange(created.id);
        setAnnouncement(created.label);
        setOpen(false);
        setInputValue("");
      }
    } finally {
      setCreating(false);
    }
  };

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
          /*
           * aria-label REPLACES the trigger's text content in the accessible
           * name, so a bare label would hide the selected company from screen
           * readers (WCAG 4.1.2). Compose label + value instead.
           */
          aria-label={
            selected ? `${t(ariaLabelKey)}: ${selected.label}` : t(ariaLabelKey)
          }
          aria-describedby={describedById}
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
              {canCreate && (
                <CommandItem
                  value="__create__"
                  disabled={creating}
                  onSelect={handleCreate}
                  className="text-primary"
                >
                  <CirclePlus className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {creating
                      ? t(creatingLabelKey)
                      : t(createLabelKey).replace("{label}", query)}
                  </span>
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
