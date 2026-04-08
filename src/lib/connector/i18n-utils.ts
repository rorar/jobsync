import type { ModuleI18n, ModuleI18nEntry } from "./manifest";

type I18nSource = {
  i18n?: ModuleI18n;
  name: string;
};

/** Look up an i18n entry by a runtime locale string (safe cast — unknown keys return undefined). */
function getEntry(i18n: ModuleI18n | undefined, locale: string): ModuleI18nEntry | undefined {
  return (i18n as Record<string, ModuleI18nEntry> | undefined)?.[locale];
}

/** Resolve display name from manifest i18n with English fallback */
export function getModuleName(module: I18nSource, locale: string): string {
  return getEntry(module.i18n, locale)?.name
    ?? getEntry(module.i18n, "en")?.name
    ?? module.name;
}

/** Resolve description from manifest i18n with English fallback */
export function getModuleDescription(
  module: I18nSource,
  locale: string,
  fallback: string,
): string {
  return getEntry(module.i18n, locale)?.description
    ?? getEntry(module.i18n, "en")?.description
    ?? fallback;
}

/** Resolve credential hint from manifest i18n with English fallback */
export function getCredentialHint(module: I18nSource, locale: string): string {
  return getEntry(module.i18n, locale)?.credentialHint
    ?? getEntry(module.i18n, "en")?.credentialHint
    ?? "";
}
