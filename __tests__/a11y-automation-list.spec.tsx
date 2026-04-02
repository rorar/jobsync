/**
 * Accessibility (axe-core) tests for AutomationList component.
 *
 * Tests: populated list a11y, empty state a11y.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render } from "@testing-library/react";
import { axe } from "@/lib/test/axe-helpers";
import type { AutomationWithResume } from "@/models/automation.model";
import { mockAutomation } from "@/lib/data/testFixtures";

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

// next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Scheduler status hook
jest.mock("@/hooks/use-scheduler-status", () => ({
  useSchedulerStatus: () => ({
    isAutomationRunning: () => false,
    state: null,
  }),
}));

// Server actions
jest.mock("@/actions/automation.actions", () => ({
  deleteAutomation: jest.fn(),
  pauseAutomation: jest.fn(),
  resumeAutomation: jest.fn(),
}));

// Toast
jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

// RunStatusBadge — stub to avoid scheduler hook depth
jest.mock("@/components/automations/RunStatusBadge", () => ({
  RunStatusBadge: () => <span data-testid="run-status-badge" />,
}));

// LocationBadge — stub to avoid EURES countries dependency
jest.mock("@/components/ui/location-badge", () => ({
  LocationBadge: ({ code }: { code: string }) => (
    <span data-testid="location-badge">{code}</span>
  ),
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

import { AutomationList } from "@/components/automations/AutomationList";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAutomation(
  id: string,
  name: string,
  overrides?: Partial<AutomationWithResume>,
): AutomationWithResume {
  return {
    ...mockAutomation,
    id,
    name,
    resume: { id: "resume-1", title: "My Resume" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AutomationList a11y", () => {
  const mockOnEdit = jest.fn();
  const mockOnRefresh = jest.fn();

  it("AutomationList with automations has no a11y violations", async () => {
    const automations = [
      makeAutomation("a1", "EU Tech Search"),
      makeAutomation("a2", "Paused Search", {
        status: "paused",
        pauseReason: "module_deactivated",
      }),
    ];
    const { container } = render(
      <AutomationList
        automations={automations}
        onEdit={mockOnEdit}
        onRefresh={mockOnRefresh}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("AutomationList empty state has no a11y violations", async () => {
    const { container } = render(
      <AutomationList
        automations={[]}
        onEdit={mockOnEdit}
        onRefresh={mockOnRefresh}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
