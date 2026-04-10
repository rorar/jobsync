"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@/i18n";

/**
 * Root-level error boundary for the Next.js App Router.
 *
 * Catches errors that `error.tsx` cannot (e.g., errors thrown from
 * `layout.tsx`, provider failures, early-mount crashes). Because
 * `global-error` renders its own `<html>` and `<body>`, the regular
 * `LocaleProvider` is NOT in the tree at this point.
 *
 * Sprint 3 Stream G fixes (mirrors Sprint 2 Stream H `dashboard/error.tsx`
 * fix `c85af40` — H-NEW-03):
 *   1. Strings routed through `useTranslations` so DE/FR/ES users no
 *      longer see English when the root boundary trips. Because the
 *      `LocaleProvider` context is unavailable here, the hook falls back
 *      to `document.documentElement.lang` (set by `RootLayout` before
 *      the error), which survives the `<html>` swap as long as we read
 *      it eagerly in a `useState` initializer before React commits.
 *   2. The alert container carries `role="alert"` + `aria-live="assertive"`
 *      + `aria-atomic="true"` so screen readers interrupt whatever they
 *      were reading and announce the failure when Next.js mounts the
 *      global error boundary (WCAG 4.1.3 "Status Messages").
 *   3. Focus is programmatically moved to the error heading on mount via
 *      `useRef` + `useEffect` + `tabIndex={-1}`, so the keyboard user
 *      lands inside the error region instead of a stranded previous-focus
 *      target (WCAG 2.4.3 "Focus Order").
 *   4. `error.message` is NO LONGER rendered verbatim — it may leak
 *      stack fragments or user-identifying information (e.g. file paths,
 *      SQL snippets, env values interpolated into messages). The generic
 *      description key is shown instead. Full detail is still available
 *      via `console.error`, which Next.js routes to the server logs in
 *      production builds.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Read the locale eagerly from the pre-swap `<html lang>`. This runs
  // exactly once, synchronously, before React commits — so even though
  // Next.js will replace `<html>` with our output below, the value we
  // captured survives into the render phase.
  const [initialLocale] = useState<string>(() => {
    if (typeof document === "undefined") return "en";
    return document.documentElement.lang || "en";
  });

  // The hook gracefully falls back to the locale we pass. We pass the
  // eagerly-captured value so the hook never reads a stale/empty value
  // after React swaps the <html> element in.
  const { t } = useTranslations(initialLocale);

  const headingRef = useRef<HTMLHeadingElement>(null);

  // Log the original error for operators — we intentionally do NOT
  // surface `error.message` in the DOM (see class doc above).
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  // WCAG 2.4.3 — after the error boundary mounts, move focus into the
  // alert region so keyboard and SR users are not stranded on a
  // detached previous-focus target. Runs once on mount.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <html lang={initialLocale}>
      <body>
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 480, padding: 24 }}>
            <h1
              ref={headingRef}
              tabIndex={-1}
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginBottom: 12,
                outline: "none",
              }}
            >
              {t("errors.somethingWentWrong")}
            </h1>
            <p style={{ color: "#666", marginBottom: 20 }}>
              {t("errors.genericDescription")}
            </p>
            <button
              onClick={reset}
              style={{
                padding: "8px 16px",
                backgroundColor: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {t("errors.tryAgain")}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
