"use client";

import { useCallback } from "react";
import { getDictionary, type TranslationKey } from "./dictionaries";
import { useLocaleContext } from "./locale-context";

/**
 * Hook for client components to access translations.
 * Reads the locale from LocaleProvider context (works during SSR),
 * falling back to the html lang attribute on the client.
 */
export function useTranslations(localeOverride?: string) {
  const contextLocale = useLocaleContext();
  const locale =
    localeOverride ??
    contextLocale ??
    (typeof document !== "undefined"
      ? document.documentElement.lang || "en"
      : "en");
  const dict = getDictionary(locale);

  const t = useCallback(
    (key: TranslationKey) => dict[key] ?? key,
    [dict],
  );

  return { t, locale };
}
