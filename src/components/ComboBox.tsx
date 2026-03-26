"use client";

import { Check, ChevronsUpDown, CirclePlus, Loader } from "lucide-react";
import { ControllerRenderProps } from "react-hook-form";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FormControl } from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { useMemo, useState, useTransition } from "react";

interface ComboboxProps {
  options: any[];
  field: ControllerRenderProps<any, any>;
  creatable?: boolean;
  onCreateOption?: (
    label: string,
  ) => Promise<{ id: string; label: string; value: string } | null>;
  placeholder?: string;
}

export function Combobox({
  options,
  field,
  creatable,
  onCreateOption,
  placeholder,
}: ComboboxProps) {
  const [newOption, setNewOption] = useState<string>("");
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>("");

  const [isPending, startTransition] = useTransition();

  const handleCreateOption = (label: string) => {
    if (!label || !onCreateOption) return;
    startTransition(async () => {
      const result = await onCreateOption(label);
      if (result) {
        options.unshift(result);
        field.onChange(result.id);
        setIsPopoverOpen(false);
        setAnnouncement(`Created ${result.label}`);
      }
    });
  };

  const showCreate = creatable && !!onCreateOption;

  const filteredOptions = useMemo(() => {
    if (!newOption) return options;
    return options.filter((opt) =>
      opt.value.includes(newOption.toLowerCase())
    );
  }, [options, newOption]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newOption.trim() && showCreate) {
      e.preventDefault();
      e.stopPropagation();
      handleCreateOption(newOption.trim());
      setNewOption("");
    } else if (e.key === "Tab") {
      setIsPopoverOpen(false);
      setNewOption("");
    }
  };

  return (
    <Popover
      open={isPopoverOpen}
      onOpenChange={(open) => {
        setIsPopoverOpen(open);
        if (!open) setNewOption("");
      }}
    >
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            variant="outline"
            role="combobox"
            type="button"
            aria-expanded={isPopoverOpen}
            className={cn(
              "md:w-[240px] lg:w-[280px] justify-between capitalize",
              !field.value && "text-muted-foreground"
            )}
          >
            {field.value
              ? options.find((option) => option.id === field.value)?.label
              : (placeholder ?? `Select ${field.name}`)}

            {isPending ? (
              <Loader className="h-4 w-4 shrink-0 spinner" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent className="md:w-[240px] lg:w-[280px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={newOption}
            onValueChange={(val: string) => setNewOption(val)}
            onKeyDown={handleInputKeyDown}
            placeholder={`${showCreate ? "Create or " : ""}Search ${field.name}`}
          />
          <CommandEmpty
            onClick={() => {
              if (showCreate) {
                handleCreateOption(newOption);
                setNewOption("");
              }
            }}
            className={cn(
              "flex cursor-pointer items-center justify-center gap-1 italic mt-2",
              (!newOption || !showCreate) &&
                "text-muted-foreground cursor-default"
            )}
          >
            {showCreate ? (
              <>
                <CirclePlus className="h-4 w-4" />
                <p>Create: </p>
                <p className="block max-w-48 truncate font-semibold text-primary">
                  {newOption}
                </p>
              </>
            ) : (
              <p className="font-semibold text-primary">No results found!</p>
            )}
          </CommandEmpty>
          <ScrollArea>
            <CommandGroup>
              <CommandList className="capitalize">
                {filteredOptions.map((option) => (
                  <CommandItem
                    value={option.value}
                    key={option.id}
                    onSelect={() => {
                      if (field.onChange) {
                        field.onChange(option.id);
                        setIsPopoverOpen(false);
                        setAnnouncement(`${option.label} selected`);
                      }
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        option.value === field.value
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandList>
            </CommandGroup>
          </ScrollArea>
        </Command>
      </PopoverContent>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </Popover>
  );
}
