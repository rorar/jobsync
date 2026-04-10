"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Shared Skeleton primitive (M-Y-08 — Sprint 3 Stream G).
 *
 * Purpose
 * -------
 * Unifies the three ad-hoc in-file skeleton components that today live in
 * `EnrichmentStatusPanel`, `StatusHistoryTimeline`, and `StatusFunnelWidget`.
 * Each of those had a hardcoded English `aria-label="Loading"` on a
 * `role="status"` wrapper (and an `aria-busy` variant in `StatusFunnelWidget`),
 * which is an i18n leak for DE/FR/ES users: the accessible name of the
 * skeleton region is frozen to English regardless of the UI locale.
 *
 * This primitive is deliberately translation-agnostic. Because a shared UI
 * atom should not itself call `useTranslations()` (that would force every
 * caller to re-render on locale change and couple the `ui/` layer to the
 * i18n adapter), the accessible label is exposed as a prop:
 *
 *   <Skeleton label={t("common.loading")}>
 *     <div className="h-4 w-24 bg-muted rounded animate-pulse" />
 *   </Skeleton>
 *
 * Callers are expected to pass a translated string via `label`. If no
 * label is provided the fallback is the English string "Loading", which
 * preserves the pre-existing (imperfect) behaviour for any caller that
 * forgets to translate. TypeScript does not force the prop because that
 * would break gradual migration; the lint-level reminder is the JSDoc here
 * and the regression test `__tests__/Skeleton.spec.tsx`.
 *
 * ARIA contract
 * -------------
 * - `role="status"` (WAI-ARIA Live Regions) announces the loading state
 *   to screen readers non-intrusively (polite by default).
 * - `aria-live="polite"` is explicit to prevent surprise if `role="status"`
 *   is ever stripped by a downstream className cleanup.
 * - `aria-busy="true"` communicates "contents are being computed" in
 *   addition to the live-region announcement. Axe flags this as correct
 *   when present alongside `role="status"`.
 * - `aria-label={label}` provides the accessible name. Children are still
 *   rendered visually, but assistive tech only reads the label. That's
 *   intentional: the pulse rectangles are decorative and should never be
 *   announced verbatim.
 * - `motion-reduce:animate-none` on any children that use `animate-pulse`
 *   is the caller's responsibility — the primitive does not inject its own
 *   animation so callers keep full layout control.
 *
 * Migration plan
 * --------------
 * Sprint 3 Stream G only ships the primitive. The three existing
 * inline skeleton sites (`EnrichmentStatusPanel:88`, `StatusHistoryTimeline:53`,
 * `StatusFunnelWidget:250`) are OUT OF SCOPE for this stream and will be
 * migrated in a follow-up once their owning streams are unblocked. Until
 * then the primitive is ready to adopt; new code should prefer it.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Accessible name for the loading region. Callers SHOULD pass a
   * translated string (e.g. `t("common.loading")`). Falls back to
   * English "Loading" to keep parity with the pre-M-Y-08 behaviour of
   * the ad-hoc sites this primitive replaces.
   */
  label?: string;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, label = "Loading", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={label}
        className={cn("relative", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Skeleton.displayName = "Skeleton";

export { Skeleton };
