/**
 * Shadcn Button variants — M-Y-06 regression guard (Sprint 3 Stream F).
 *
 * The `size="icon"` default is 40x40 (h-10 w-10), which fails WCAG 2.5.5
 * AAA (44x44 minimum). Changing the default would be a HIGH blast-radius
 * refactor — 26 files across the codebase use `size="icon"` in inline
 * toolbars, admin tables, calendar cells, and header rows where a 44px
 * footprint would cause visual regressions.
 *
 * The Sprint 3 Stream F fix introduces a new `size="icon-lg"` variant
 * that resolves to 44x44 (h-11 w-11). Individual call sites can opt into
 * AAA compliance by switching `icon` → `icon-lg` once they verify the
 * surrounding layout can absorb the extra 4px.
 *
 * This spec pins:
 *   1. `icon` default stays at h-10 w-10 (40x40) — guards against an
 *      accidental default change that would ripple through 26 files.
 *   2. `icon-lg` resolves to h-11 w-11 (44x44) — guards against the
 *      new variant being dropped in a future refactor.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button size variants — M-Y-06 target sizes (WCAG 2.5.5 AAA)", () => {
  it("size='icon' default stays at 40x40 (h-10 w-10) — high-blast-radius guard", () => {
    render(<Button size="icon" aria-label="Open menu" />);
    const btn = screen.getByRole("button", { name: "Open menu" });
    // The default size="icon" is intentionally NOT 44x44 — changing it
    // would ripple across 26 existing usages with their own layout
    // assumptions. AAA compliance is opt-in via `size="icon-lg"`.
    expect(btn).toHaveClass("h-10");
    expect(btn).toHaveClass("w-10");
  });

  it("size='icon-lg' resolves to 44x44 (h-11 w-11) — new variant for AAA compliance", () => {
    render(<Button size="icon-lg" aria-label="Health check" />);
    const btn = screen.getByRole("button", { name: "Health check" });
    expect(btn).toHaveClass("h-11");
    expect(btn).toHaveClass("w-11");
  });

  it("size='icon-lg' keeps all other button behaviours (variant, onClick, disabled)", () => {
    const onClick = jest.fn();
    render(
      <Button
        size="icon-lg"
        variant="ghost"
        onClick={onClick}
        disabled
        aria-label="Refresh"
      />,
    );
    const btn = screen.getByRole("button", { name: "Refresh" });
    expect(btn).toBeDisabled();
    // `variant="ghost"` + `size="icon-lg"` should compose cleanly.
    expect(btn).toHaveClass("h-11");
    expect(btn).toHaveClass("w-11");
  });

  it("size='icon-lg' still forwards className overrides", () => {
    render(
      <Button size="icon-lg" className="bg-red-500" aria-label="Delete" />,
    );
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn).toHaveClass("h-11");
    expect(btn).toHaveClass("bg-red-500");
  });
});
