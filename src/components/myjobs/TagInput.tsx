"use client";
import { useState, useTransition } from "react";
import { X, ChevronsUpDown, CirclePlus, Loader } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tag } from "@/models/job.model";
import { createTag } from "@/actions/tag.actions";
import { toast } from "../ui/use-toast";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n";

const MAX_TAGS = 10;

interface TagInputProps {
  availableTags: Tag[];
  selectedTagIds: string[];
  onChange: (ids: string[]) => void;
}

export function TagInput({
  availableTags,
  selectedTagIds,
  onChange,
}: TagInputProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [localTags, setLocalTags] = useState<Tag[]>(availableTags);
  const [isPending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const { t } = useTranslations();

  const selectedTags = localTags.filter((t) => selectedTagIds.includes(t.id));
  const isMaxReached = selectedTagIds.length >= MAX_TAGS;

  // Tags not yet selected, filtered by input
  const filteredOptions = localTags.filter(
    (t) =>
      !selectedTagIds.includes(t.id) &&
      t.label.toLowerCase().includes(inputValue.toLowerCase()),
  );

  // Whether the typed value exactly matches an existing tag (case-insensitive)
  const exactMatchExists = localTags.some(
    (t) => t.value === inputValue.trim().toLowerCase(),
  );

  const addTagById = (id: string) => {
    if (selectedTagIds.length >= MAX_TAGS) return;
    onChange([...selectedTagIds, id]);
  };

  const removeTagById = (id: string) => {
    onChange(selectedTagIds.filter((tid) => tid !== id));
  };

  const handleCreate = (rawLabel: string) => {
    const label = rawLabel.trim();
    if (!label || isMaxReached) return;

    // Clear the field NOW, not after the round trip.
    //
    // This line used to sit inside the transition below, after `await`. A
    // transition write is low priority, so it could commit AFTER the user had
    // already typed the next skill — and because this input is CONTROLLED,
    // React then wrote the stale `""` back into the DOM as well. The typed
    // text vanished from the field, and the next Enter had nothing to act on:
    // no request, no chip, no error, no toast.
    //
    // Reading `e.currentTarget.value` in the key handler does NOT fix that on
    // its own, which is how the mechanism was finally identified: the first
    // attempt did exactly that and E2E-B43 still reproduced 1 for 1, because a
    // controlled input's DOM value is whatever the last commit said.
    //
    // Clearing here is also what the user expects: Enter has been accepted,
    // the field starts over. The one thing it costs is the typed text on a
    // FAILED create, so the failure branch puts it back.
    setInputValue("");

    startTransition(async () => {
      const result = await createTag(label);
      if (!result?.success) {
        toast({
          variant: "destructive",
          title: t("common.error"),
          description: result?.message ?? t("jobs.skillCreateFailed"),
        });
        // Give the text back rather than swallowing it — the user still has
        // to be able to retry or correct it.
        setInputValue(label);
        return;
      }
      const newTag: Tag = result.data as Tag;
      // Add to local pool if not already there
      setLocalTags((prev) =>
        prev.some((t) => t.id === newTag.id) ? prev : [...prev, newTag],
      );
      addTagById(newTag.id);
      // NO setInputValue("") here — that is the write this defect was made of.
      // It already happened, synchronously, before the request went out.
      setAnnouncement(
        `Created ${newTag.label}, ${selectedTagIds.length + 1} of ${MAX_TAGS}`,
      );
    });
  };

  const handleSelect = (tagId: string) => {
    const tag = localTags.find((t) => t.id === tagId);
    addTagById(tagId);
    setInputValue("");
    setAnnouncement(
      `${tag?.label ?? "Tag"} added, ${selectedTagIds.length + 1} of ${MAX_TAGS}`,
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) setInputValue(""); // Clear input on any close (click-outside, Escape)
        }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={t("jobs.addSkill")}
            className={cn(
              "w-full justify-between font-normal",
              isMaxReached && "opacity-50 cursor-not-allowed",
            )}
            disabled={isMaxReached}
            type="button"
          >
            {isMaxReached
              ? t("jobs.maxSkills")
              : t("jobs.searchSkill")}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t("jobs.typeSkill")}
              value={inputValue}
              onValueChange={setInputValue}
              onKeyDown={(e) => {
                // Read what the FIELD holds, not what state remembers.
                //
                // `handleCreate` clears `inputValue` from inside a
                // `startTransition`, so that write is low priority and may
                // commit after the next keystrokes have already been typed
                // into the DOM input. This handler then ran against a value
                // the user could no longer see, and took one of two silent
                // exits: empty (the guard below is false, so nothing at all
                // happens) or the PREVIOUS skill (which now exists and is
                // already selected, so the branch below only re-clears the
                // field). No request, no chip, no error, no toast — the entry
                // is simply lost.
                //
                // Measured as E2E-B43: against a production build,
                // `keyboard-ux.spec.ts:755` failed 5 runs out of 5 on the
                // second or third skill, and a 500 ms sampler over the run
                // database proved the create never reached the server. Five
                // dev runs passed, which is why this survived: the dev server
                // is slow enough that the transition commits before the next
                // keystroke arrives.
                const typed = e.currentTarget.value;
                if (e.key === "Enter" && typed.trim()) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (isMaxReached) {
                    toast({
                      variant: "destructive",
                      title: t("common.error"),
                      description: t("jobs.maxSkills"),
                    });
                    setAnnouncement(
                      `Maximum ${MAX_TAGS} skills reached`,
                    );
                    return;
                  }
                  // Resolved from `typed` as well, for the same reason. The
                  // render-time `exactMatchExists` describes `inputValue`, and
                  // that is the value this handler must not trust.
                  const normalized = typed.trim().toLowerCase();
                  const existing = localTags.find(
                    (tag) => tag.value === normalized,
                  );
                  if (existing) {
                    if (!selectedTagIds.includes(existing.id)) {
                      handleSelect(existing.id);
                    } else {
                      // Tag exists but is already selected — clear input + inform user
                      setInputValue("");
                      setAnnouncement(`${typed.trim()} already selected`);
                    }
                  } else {
                    // Create new tag from input
                    handleCreate(typed);
                  }
                }
                if (e.key === "Tab") {
                  setOpen(false);
                  setInputValue("");
                }
              }}
            />
            <CommandList>
              {filteredOptions.length === 0 && !inputValue && (
                <CommandEmpty>{t("jobs.noSkills")}</CommandEmpty>
              )}
              {filteredOptions.length > 0 && (
                <CommandGroup>
                  {filteredOptions.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      onSelect={() => handleSelect(tag.id)}
                    >
                      {tag.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {inputValue.trim() && !exactMatchExists && (
                <CommandGroup>
                  <CommandItem
                    // Arrow, not a bare reference: cmdk calls `onSelect` with
                    // the ITEM's value, which is not the typed text.
                    onSelect={() => handleCreate(inputValue)}
                    disabled={isPending || isMaxReached}
                    className="text-primary"
                  >
                    {isPending ? (
                      <Loader className="mr-2 h-4 w-4 spinner" />
                    ) : (
                      <CirclePlus className="mr-2 h-4 w-4" />
                    )}
                    {t("jobs.createSkill")} &quot;{inputValue.trim()}&quot;
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
              {tag.label}
              <button
                type="button"
                onClick={() => removeTagById(tag.id)}
                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Remove ${tag.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
