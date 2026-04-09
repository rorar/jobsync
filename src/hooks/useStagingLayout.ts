"use client";
import { useCallback, useEffect, useState } from "react";

export type StagingLayoutSize = "compact" | "default" | "comfortable";

const STORAGE_KEY = "jobsync-staging-layout-size";
const DEFAULT_SIZE: StagingLayoutSize = "default";
const VALID_SIZES: StagingLayoutSize[] = ["compact", "default", "comfortable"];

export function getPersistedStagingLayoutSize(): StagingLayoutSize {
  if (typeof window === "undefined") return DEFAULT_SIZE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_SIZES.includes(stored as StagingLayoutSize)) {
      return stored as StagingLayoutSize;
    }
  } catch {
    // ignore (privacy mode, quota, etc.)
  }
  return DEFAULT_SIZE;
}

export function persistStagingLayoutSize(size: StagingLayoutSize): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // ignore
  }
}

/**
 * Hook for reading + writing the user's staging layout preference.
 * SSR-safe: starts with default, hydrates from localStorage on mount.
 */
export function useStagingLayout() {
  const [size, setSizeState] = useState<StagingLayoutSize>(DEFAULT_SIZE);

  useEffect(() => {
    setSizeState(getPersistedStagingLayoutSize());
  }, []);

  const setSize = useCallback((newSize: StagingLayoutSize) => {
    setSizeState(newSize);
    persistStagingLayoutSize(newSize);
  }, []);

  return { size, setSize };
}

/**
 * Maps a layout size to its Tailwind max-width class for the outer container.
 * Compact = tighter reading width, comfortable = wide.
 */
export function getStagingMaxWidthClass(size: StagingLayoutSize): string {
  switch (size) {
    case "compact":
      return "max-w-3xl"; // ~768px
    case "default":
      return "max-w-5xl"; // ~1024px
    case "comfortable":
      return "max-w-7xl"; // ~1280px
  }
}
