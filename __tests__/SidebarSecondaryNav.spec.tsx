/**
 * Sidebar secondary-nav demotion — Sprint 3 Stream G Sprint 2
 * follow-up regression guard.
 *
 * Before this sprint the Sidebar rendered TWO `<nav>` landmarks: a
 * primary one (multiple links) and a secondary one wrapping a single
 * Settings link. WAI-ARIA and Deque's axe "region-single-landmark"
 * rule both discourage landmarks with only one meaningful child
 * because they add noise to the landmark list for zero navigational
 * benefit — screen-reader users hearing "navigation, Settings,
 * navigation end" is pure padding.
 *
 * After the fix the secondary nav is demoted to a plain `<div>`. The
 * primary nav is untouched — it still carries its translated
 * aria-label. This spec locks both invariants in.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";

// next/navigation returns the current pathname; stub it to a known
// route so the primary nav's NavLink active-state logic is stable.
jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

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
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
    asChild: _asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "nav.primaryNavigation": "Primary navigation",
        "nav.secondaryNavigation": "Secondary navigation",
        "nav.settings": "Settings",
        "nav.dashboard": "Dashboard",
        "nav.myJobs": "My Jobs",
        "nav.automations": "Automations",
        "nav.stagingQueue": "Staging Queue",
        "nav.tasks": "Tasks",
        "nav.activities": "Activities",
        "nav.questionBank": "Question Bank",
        "nav.profile": "Profile",
        "nav.administration": "Administration",
        "nav.developerOptions": "Developer Options",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

import Sidebar from "@/components/Sidebar";

describe("Sidebar — secondary nav demotion (Sprint 3 Stream G)", () => {
  it("renders exactly ONE <nav> landmark (primary nav only)", () => {
    render(<Sidebar />);

    // Before the fix there were TWO nav landmarks (primary +
    // secondary single-link). After the fix there is ONE.
    const navLandmarks = screen.getAllByRole("navigation");
    expect(navLandmarks).toHaveLength(1);
  });

  it("keeps the primary nav's translated aria-label", () => {
    render(<Sidebar />);

    const primaryNav = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(primaryNav).toBeInTheDocument();
  });

  it("does NOT expose a 'Secondary navigation' landmark", () => {
    // Explicit guard against the pre-fix shape. If someone adds back a
    // secondary <nav> wrapping a single Settings link, this test fails
    // and the regression surfaces immediately.
    render(<Sidebar />);

    expect(
      screen.queryByRole("navigation", { name: "Secondary navigation" }),
    ).not.toBeInTheDocument();
  });

  it("still renders the Settings link (now inside a plain div)", () => {
    // The demotion must not drop the link itself — only the <nav>
    // landmark around it. Accessible via the NavLink's sr-only label.
    render(<Sidebar />);

    const settingsLink = screen.getByRole("link", { name: "Settings" });
    expect(settingsLink).toBeInTheDocument();
    expect(settingsLink).toHaveAttribute("href", "/dashboard/settings");
  });
});
