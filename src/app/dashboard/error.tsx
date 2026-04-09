"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "@/i18n";

/**
 * Dashboard error boundary.
 *
 * H-NEW-03 fixes (WCAG 3.1.1 + 4.1.3 + 2.4.3):
 *   1. All visible strings routed through `useTranslations` so DE/FR/ES
 *      users no longer see English mid-session.
 *   2. Container carries `role="alert"` + `aria-live="assertive"` so screen
 *      readers interrupt whatever they were reading and announce the
 *      failure when Next.js swaps the error boundary in.
 *   3. Focus is programmatically moved to the error heading on mount so
 *      the keyboard user lands inside the error region instead of a
 *      detached previous-focus target. Matches the focus pattern used by
 *      `SuperLikeCelebration` in Sprint 1 CRIT-Y3 (commit 681a53d).
 *   4. `error.message` is NO LONGER rendered verbatim — it may contain
 *      stack fragments or user-identifying information. The generic
 *      description key is shown instead. Full error detail remains
 *      available server-side via Next.js logging.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const { t } = useTranslations();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Log the original error for operators — we intentionally do NOT surface
  // `error.message` in the DOM (see class doc above).
  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  // WCAG 2.4.3 — after the error boundary mounts, move focus into the
  // alert region so keyboard and SR users are not stranded on a detached
  // previous-focus target.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="flex min-h-screen items-center justify-center"
    >
      <div className="text-center space-y-4">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        >
          {t("errors.somethingWentWrong")}
        </h1>
        <p className="text-muted-foreground">
          {t("errors.genericDescription")}
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("errors.tryAgain")}
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 border rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("errors.goToDashboard")}
          </Link>
        </div>
      </div>
    </div>
  );
}
