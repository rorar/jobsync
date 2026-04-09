"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe media query hook.
 *
 * Returns `false` during SSR and on the initial client render (mobile-first
 * default). After mount, subscribes to a `MediaQueryList` and updates whenever
 * the match changes.
 *
 * @param query A CSS media query string, e.g. `"(min-width: 640px)"`.
 * @returns `true` when the query currently matches, `false` otherwise.
 *
 * @example
 * const isDesktop = useMediaQuery("(min-width: 640px)");
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mql = window.matchMedia(query);
    // Initialise with the current value once mounted (may differ from SSR default).
    setMatches(mql.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Modern browsers
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleChange);
      return () => mql.removeEventListener("change", handleChange);
    }

    // Safari < 14 / legacy fallback
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, [query]);

  return matches;
}
