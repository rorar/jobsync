/**
 * NavLink active-route detection — Sprint 3 Stream G regression guard.
 *
 * Before this sprint, active-route detection used a historical typo:
 *
 *   pathname.startsWith(`${route}/dashboard`)
 *
 * which could never match any real sidebar route because every
 * `SIDEBAR_LINKS` entry's `route` already starts with `/dashboard/...`.
 * The practical effect: every nav item only lit up on its EXACT route,
 * never on any sub-route. Navigating to `/dashboard/myjobs/abc` left
 * the "My Jobs" link inactive.
 *
 * The fix introduces the correct rule:
 *
 *   (a) exact equality on the route itself
 *   (b) direct prefix + "/" for sub-routes
 *   (c) the root `/dashboard` item is exact-only (no sub-route highlight)
 *       so it doesn't simultaneously light up alongside child items
 *
 * This spec exercises every rule plus the historical edge cases.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { Home } from "lucide-react";
import NavLink from "@/components/NavLink";

// Radix Tooltip + next/link bail out gracefully in jsdom as long as the
// ambient context + environment is stable. We're only asserting on the
// aria-current attribute of the inner <a>, not tooltip rendering.
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
    asChild: _asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}));

/**
 * Convenience: render a NavLink and return the inner anchor so tests
 * can assert against `aria-current`.
 */
function renderNavLink(route: string, pathname: string) {
  render(
    <NavLink label="Test Link" Icon={Home} route={route} pathname={pathname} />,
  );
  // The sr-only label is inside the anchor; querying by accessible
  // name hits it reliably.
  return screen.getByRole("link", { name: "Test Link" });
}

describe("NavLink active-route detection — Sprint 3 Stream G", () => {
  describe("sub-route nav item (route = /dashboard/myjobs)", () => {
    it("is active on the exact route", () => {
      const link = renderNavLink("/dashboard/myjobs", "/dashboard/myjobs");
      expect(link).toHaveAttribute("aria-current", "page");
    });

    it("is active on a direct sub-route /dashboard/myjobs/abc123", () => {
      // Regression guard for the original typo — before the fix this
      // assertion failed because `startsWith("/dashboard/myjobs/dashboard")`
      // never matched.
      const link = renderNavLink(
        "/dashboard/myjobs",
        "/dashboard/myjobs/abc123",
      );
      expect(link).toHaveAttribute("aria-current", "page");
    });

    it("is active on a deeper sub-route /dashboard/myjobs/abc/edit", () => {
      const link = renderNavLink(
        "/dashboard/myjobs",
        "/dashboard/myjobs/abc/edit",
      );
      expect(link).toHaveAttribute("aria-current", "page");
    });

    it("is NOT active on a sibling route /dashboard/tasks", () => {
      const link = renderNavLink("/dashboard/myjobs", "/dashboard/tasks");
      expect(link).not.toHaveAttribute("aria-current");
    });

    it("is NOT active on a partial-prefix sibling /dashboard/myjobs-archive", () => {
      // Guard against the naive `startsWith(route)` bug (without the
      // trailing slash). Without the slash, `/dashboard/myjobs-archive`
      // would falsely light up `/dashboard/myjobs`.
      const link = renderNavLink(
        "/dashboard/myjobs",
        "/dashboard/myjobs-archive",
      );
      expect(link).not.toHaveAttribute("aria-current");
    });

    it("is NOT active on the root /dashboard page", () => {
      const link = renderNavLink("/dashboard/myjobs", "/dashboard");
      expect(link).not.toHaveAttribute("aria-current");
    });
  });

  describe("root dashboard nav item (route = /dashboard)", () => {
    it("is active only on the exact /dashboard route", () => {
      const link = renderNavLink("/dashboard", "/dashboard");
      expect(link).toHaveAttribute("aria-current", "page");
    });

    it("is NOT active on a sub-route /dashboard/myjobs", () => {
      // Without the root-special-case the naive startsWith rule would
      // highlight "Dashboard" on every subpage, double-highlighting
      // alongside the child item. We explicitly forbid that.
      const link = renderNavLink("/dashboard", "/dashboard/myjobs");
      expect(link).not.toHaveAttribute("aria-current");
    });

    it("is NOT active on a deeper sub-route /dashboard/myjobs/abc", () => {
      const link = renderNavLink("/dashboard", "/dashboard/myjobs/abc");
      expect(link).not.toHaveAttribute("aria-current");
    });
  });

  describe("staging nav item (route = /dashboard/staging)", () => {
    it("is active on /dashboard/staging", () => {
      const link = renderNavLink("/dashboard/staging", "/dashboard/staging");
      expect(link).toHaveAttribute("aria-current", "page");
    });

    it("is active on /dashboard/staging/new", () => {
      const link = renderNavLink(
        "/dashboard/staging",
        "/dashboard/staging/new",
      );
      expect(link).toHaveAttribute("aria-current", "page");
    });
  });
});
