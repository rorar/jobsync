"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ChipItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  /** Optional action button rendered after the label (e.g., detail/link icon) */
  action?: React.ReactNode;
  /** Per-item override: false prevents editing this specific chip even when list is editable */
  editable?: boolean;
}

interface ChipListProps {
  items: ChipItem[];
  onRemove: (value: string) => void;
  onEdit?: (oldValue: string, newValue: string) => void;
  editable?: boolean;
}

export function ChipList({
  items,
  onRemove,
  onEdit,
  editable = false,
}: ChipListProps) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  if (items.length === 0) return null;

  const startEdit = (item: ChipItem) => {
    if (!editable || !onEdit) return;
    // Per-item editable override: skip if explicitly set to false
    if (item.editable === false) return;
    setEditingValue(item.value);
    setEditText(item.label);
  };

  const commitEdit = () => {
    if (editingValue && onEdit && editText.trim()) {
      onEdit(editingValue, editText.trim());
    }
    setEditingValue(null);
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingValue(null);
    setEditText("");
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        if (editingValue === item.value) {
          return (
            <Input
              key={item.value}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEdit();
                }
                if (e.key === "Escape") cancelEdit();
              }}
              onBlur={commitEdit}
              className="h-6 w-40 px-2 py-0 text-xs"
              autoFocus
            />
          );
        }

        const itemEditable = editable && item.editable !== false;

        return (
          <Badge
            key={item.value}
            variant="secondary"
            // Allow long labels (e.g., ESCO occupation names in German:
            // "Entwickler von Benutzeroberflächen/Entwicklerin von
            // Benutzeroberflächen (2512.4)") to wrap instead of forcing
            // the parent container to scroll horizontally. The Badge
            // primitive has `whitespace-nowrap` by default; we override
            // it here with `whitespace-normal` + `max-w-full` so the
            // chip stays within the dialog width. The detail button
            // (eye icon) provides access to the full untruncated label.
            className="gap-1.5 pr-1 whitespace-normal max-w-full"
          >
            {item.icon}
            <span
              className={cn(
                "break-words",
                itemEditable && "cursor-pointer hover:underline",
              )}
              onClick={() => startEdit(item)}
              role={itemEditable ? "button" : undefined}
              tabIndex={itemEditable ? 0 : undefined}
              onKeyDown={
                itemEditable
                  ? (e) => {
                      if (e.key === "Enter") startEdit(item);
                    }
                  : undefined
              }
            >
              {item.label}
            </span>
            {item.action}
            <button
              type="button"
              onClick={() => onRemove(item.value)}
              className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
              aria-label={`Remove ${item.label}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
}
