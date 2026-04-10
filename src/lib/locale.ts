import "server-only";

import { cookies } from "next/headers";
import { auth } from "@/auth";
import db from "@/lib/db";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/locales";

const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Get the user's preferred locale.
 * Priority: User DB settings → Cookie → Default ("en")
 */
export async function getUserLocale(): Promise<string> {
  try {
    // 1. Check authenticated user's settings
    const session = await auth();
    if (session?.user?.id) {
      const settings = await db.userSettings.findUnique({
        where: { userId: session.user.id },
      });
      if (settings?.settings) {
        try {
          const parsed = JSON.parse(settings.settings);
          // M-A-03: writers persist the locale under `parsed.display.locale`
          // (see `updateDisplaySettings` in `src/actions/userSettings.actions.ts`
          // and the `DisplaySettings` shape in `src/models/userSettings.model.ts`).
          // The previous read path looked at `parsed.locale`, which never
          // exists in practice — every authenticated lookup silently fell
          // back to the cookie / default locale. Canonical path first, with
          // a legacy `parsed.locale` fallback in case any pre-migration rows
          // still exist.
          const displayLocale = parsed?.display?.locale;
          if (displayLocale && isValidLocale(displayLocale)) {
            return displayLocale;
          }
          if (parsed?.locale && isValidLocale(parsed.locale)) {
            return parsed.locale;
          }
        } catch (error) {
          console.debug(
            "[locale] userSettings.settings JSON parse failed: falling back to default",
            error,
          );
        }
      }
    }

    // 2. Check cookie
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
    if (cookieLocale && isValidLocale(cookieLocale)) {
      return cookieLocale;
    }
  } catch (error) {
    console.debug(
      "[locale] getUserLocale auth/DB/cookie read failed: falling back to default",
      error,
    );
  }

  return DEFAULT_LOCALE;
}

/**
 * Client-safe version: reads locale from cookie only (no DB access).
 * Use in API routes where auth() may not be available.
 */
export async function getLocaleFromCookie(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
    if (cookieLocale && isValidLocale(cookieLocale)) {
      return cookieLocale;
    }
  } catch (error) {
    console.debug(
      "[locale] getLocaleFromCookie cookie read failed: falling back to default",
      error,
    );
  }
  return DEFAULT_LOCALE;
}
