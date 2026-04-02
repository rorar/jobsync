/**
 * Accessibility (axe-core) tests for CompanyBlacklistSettings component.
 *
 * Tests: populated entries a11y, empty state a11y.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { axe } from "@/lib/test/axe-helpers";
import type { CompanyBlacklist } from "@/models/companyBlacklist.model";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => key,
    locale: "en",
  })),
}));

// Server actions — controllable via mockResolvedValue
const mockGetBlacklistEntries = jest.fn();

jest.mock("@/actions/companyBlacklist.actions", () => ({
  getBlacklistEntries: (...args: unknown[]) =>
    mockGetBlacklistEntries(...args),
  addBlacklistEntry: jest.fn(),
  removeBlacklistEntry: jest.fn(),
}));

// Toast
jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

// lucide-react — minimal icon stubs
jest.mock("lucide-react", () => {
  const icons = new Proxy(
    {},
    {
      get: (_, name) => {
        const Component = (props: Record<string, unknown>) => (
          <span data-testid={`icon-${String(name)}`} {...props} />
        );
        Component.displayName = String(name);
        return Component;
      },
    },
  );
  return icons;
});

import CompanyBlacklistSettings from "@/components/settings/CompanyBlacklistSettings";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockEntries: CompanyBlacklist[] = [
  {
    id: "bl-1",
    userId: "user-1",
    pattern: "Scam Corp",
    matchType: "exact",
    reason: "Known recruiter scam",
    createdAt: new Date("2026-03-01"),
    updatedAt: new Date("2026-03-01"),
  },
  {
    id: "bl-2",
    userId: "user-1",
    pattern: "spam",
    matchType: "contains",
    reason: null,
    createdAt: new Date("2026-03-10"),
    updatedAt: new Date("2026-03-10"),
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CompanyBlacklistSettings a11y", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("CompanyBlacklistSettings with entries has no a11y violations", async () => {
    mockGetBlacklistEntries.mockResolvedValue({
      success: true,
      data: mockEntries,
    });

    const { container } = render(<CompanyBlacklistSettings />);

    // Wait for entries to load
    await waitFor(() => {
      expect(mockGetBlacklistEntries).toHaveBeenCalled();
    });

    await waitFor(() => {
      const text = container.textContent ?? "";
      expect(text).toContain("Scam Corp");
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("CompanyBlacklistSettings empty state has no a11y violations", async () => {
    mockGetBlacklistEntries.mockResolvedValue({
      success: true,
      data: [],
    });

    const { container } = render(<CompanyBlacklistSettings />);

    // Wait for loading to finish
    await waitFor(() => {
      expect(mockGetBlacklistEntries).toHaveBeenCalled();
    });

    await waitFor(() => {
      const text = container.textContent ?? "";
      expect(text).toContain("blacklist.noEntries");
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
