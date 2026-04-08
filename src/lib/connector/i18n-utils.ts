import type { ModuleI18n } from "./manifest";

type I18nSource = {
  i18n?: ModuleI18n;
  name: string;
};

/** Resolve display name from manifest i18n with English fallback */
export function getModuleName(module: I18nSource, locale: string): string {
  return module.i18n?.[locale]?.name
    ?? module.i18n?.["en"]?.name
    ?? module.name;
}

/** Resolve description from manifest i18n with English fallback */
export function getModuleDescription(
  module: I18nSource,
  locale: string,
  fallback: string,
): string {
  return module.i18n?.[locale]?.description
    ?? module.i18n?.["en"]?.description
    ?? fallback;
}

/** Resolve credential hint from manifest i18n with English fallback */
export function getCredentialHint(module: I18nSource, locale: string): string {
  return module.i18n?.[locale]?.credentialHint
    ?? module.i18n?.["en"]?.credentialHint
    ?? "";
}
