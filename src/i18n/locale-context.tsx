"use client";

import { createContext, useContext, type ReactNode } from "react";

const LocaleContext = createContext<string | undefined>(undefined);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocaleContext(): string | undefined {
  return useContext(LocaleContext);
}
