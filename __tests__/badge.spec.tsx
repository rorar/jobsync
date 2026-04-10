/**
 * Badge component regression guard (L-T-07).
 *
 * Sprint 0 added `whitespace-nowrap` to the Badge base class so that badges
 * grow to fit translated text instead of wrapping mid-word. This test pins
 * that class against future regressions.
 *
 * Scope: class-level assertions only. Full layout / overflow testing is out
 * of scope for jsdom-based unit tests.
 *
 * Reference: src/components/ui/badge.tsx (badgeVariants base class),
 * CLAUDE.md "Reusable UI Components" section.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("Badge — whitespace-nowrap regression guard (L-T-07)", () => {
  it("renders a span with the whitespace-nowrap class for the default variant", () => {
    const { container } = render(
      <Badge>Sehr langer Bezeichner</Badge>,
    );
    const badge = container.querySelector("span");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("whitespace-nowrap");
  });

  it("renders with whitespace-nowrap for the secondary variant", () => {
    render(<Badge variant="secondary">Secondary Badge</Badge>);
    const badge = screen.getByText("Secondary Badge");
    expect(badge).toHaveClass("whitespace-nowrap");
  });

  it("renders with whitespace-nowrap for the destructive variant", () => {
    render(<Badge variant="destructive">Destructive Badge</Badge>);
    const badge = screen.getByText("Destructive Badge");
    expect(badge).toHaveClass("whitespace-nowrap");
  });

  it("renders with whitespace-nowrap for the outline variant", () => {
    render(<Badge variant="outline">Outline Badge</Badge>);
    const badge = screen.getByText("Outline Badge");
    expect(badge).toHaveClass("whitespace-nowrap");
  });

  it("preserves whitespace-nowrap when a custom className is also passed", () => {
    render(<Badge className="my-custom-class">Custom</Badge>);
    const badge = screen.getByText("Custom");
    expect(badge).toHaveClass("whitespace-nowrap");
    expect(badge).toHaveClass("my-custom-class");
  });

  it("renders text content correctly (smoke test)", () => {
    render(<Badge>Applied</Badge>);
    expect(screen.getByText("Applied")).toBeInTheDocument();
  });
});
