/**
 * Accessibility (axe-core) tests for PublicApiKeySettings component.
 *
 * Tests: loading state a11y, populated keys list a11y.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { axe } from "@/lib/test/axe-helpers";
import type { PublicApiKeyResponse } from "@/models/publicApiKey.model";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => key,
    locale: "en",
  })),
  formatDateCompact: (d: Date) => d?.toLocaleDateString() ?? "",
}));

// Server actions — controllable via mockResolvedValue
const mockListPublicApiKeys = jest.fn();

jest.mock("@/actions/publicApiKey.actions", () => ({
  createPublicApiKey: jest.fn(),
  listPublicApiKeys: (...args: unknown[]) => mockListPublicApiKeys(...args),
  revokePublicApiKey: jest.fn(),
  deletePublicApiKey: jest.fn(),
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

import PublicApiKeySettings from "@/components/settings/PublicApiKeySettings";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockKeys: PublicApiKeyResponse[] = [
  {
    id: "key-1",
    name: "Production Key",
    keyPrefix: "pk_live_abcd",
    permissions: ["read"],
    lastUsedAt: new Date("2026-03-20"),
    createdAt: new Date("2026-01-15"),
    revokedAt: null,
  },
  {
    id: "key-2",
    name: "Old Key",
    keyPrefix: "pk_live_wxyz",
    permissions: [],
    lastUsedAt: null,
    createdAt: new Date("2025-12-01"),
    revokedAt: new Date("2026-02-10"),
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PublicApiKeySettings a11y", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("PublicApiKeySettings loading state has no a11y violations", async () => {
    // Keep the promise pending to keep the component in loading state
    mockListPublicApiKeys.mockReturnValue(new Promise(() => {}));

    const { container } = render(<PublicApiKeySettings />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("PublicApiKeySettings with keys has no a11y violations", async () => {
    mockListPublicApiKeys.mockResolvedValue({
      success: true,
      data: mockKeys,
    });

    const { container } = render(<PublicApiKeySettings />);

    // Wait for loading to finish and keys to appear
    await waitFor(() => {
      expect(mockListPublicApiKeys).toHaveBeenCalled();
    });

    // Wait for state to settle after async fetch
    await waitFor(() => {
      const text = container.textContent ?? "";
      expect(text).toContain("Production Key");
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
