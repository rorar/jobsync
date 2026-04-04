"use client";

import { useGlobalUndo } from "@/hooks/useGlobalUndo";

/**
 * Thin client component that activates the global Ctrl+Z undo listener.
 * Renders nothing — used in the dashboard layout.
 */
export function GlobalUndoListener() {
  useGlobalUndo();
  return null;
}
