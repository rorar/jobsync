/**
 * Skeleton primitive — Sprint 3 Stream G M-Y-08 regression guard.
 *
 * The previous ad-hoc skeleton implementations (in `EnrichmentStatusPanel`,
 * `StatusHistoryTimeline`, `StatusFunnelWidget`) hardcoded an English
 * `aria-label="Loading"` on a `role="status"` wrapper, which is a
 * cross-locale i18n leak. The new shared `Skeleton` primitive exposes
 * the accessible name as a prop so callers can pass `t("common.loading")`.
 *
 * This spec locks in the ARIA contract so future refactors don't
 * regress the label-as-prop decision back to a hardcoded string.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { Skeleton } from "@/components/ui/skeleton";

describe("Skeleton primitive — M-Y-08", () => {
  it("exposes role=status + aria-live=polite + aria-busy=true", () => {
    render(
      <Skeleton label="Wird geladen">
        <div data-testid="child" />
      </Skeleton>,
    );

    const region = screen.getByRole("status");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-busy", "true");
  });

  it("uses the caller-provided translated label as the accessible name", () => {
    // Simulate a German caller.
    render(<Skeleton label="Wird geladen" />);

    // The accessible name MUST come from the prop, not a hardcoded
    // English fallback.
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-label", "Wird geladen");
    expect(region).toHaveAccessibleName("Wird geladen");
  });

  it("uses the caller-provided French label", () => {
    render(<Skeleton label="Chargement" />);

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-label", "Chargement");
  });

  it("falls back to English 'Loading' when no label is supplied", () => {
    // Keeping parity with the pre-M-Y-08 behaviour of the ad-hoc sites
    // this primitive replaces. New callers SHOULD pass a translated
    // label; the fallback is a safety net for gradual migration.
    render(<Skeleton />);

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-label", "Loading");
  });

  it("renders children inside the live region so layout is preserved", () => {
    render(
      <Skeleton label="Loading">
        <div data-testid="child" className="h-4 w-24 bg-muted" />
      </Skeleton>,
    );

    const region = screen.getByRole("status");
    const child = screen.getByTestId("child");
    expect(region).toContainElement(child);
  });

  it("forwards additional props and className to the root div", () => {
    render(
      <Skeleton label="Loading" className="custom-class" data-testid="wrap" />,
    );

    const region = screen.getByTestId("wrap");
    expect(region).toHaveClass("custom-class");
    expect(region).toHaveAttribute("role", "status");
  });

  it("forwards refs for imperative access", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Skeleton ref={ref} label="Loading" />);

    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute("role")).toBe("status");
  });
});
