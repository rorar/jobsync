/**
 * KanbanCard component tests — M-Y-05 regression guard (Sprint 3 Stream F).
 *
 * The drag handle was ~20x20 (h-4 w-4 icon + p-0.5 padding), failing BOTH
 * WCAG 2.5.5 AAA (44x44) AND WCAG 2.5.8 AA (24x24 minimum). This was the
 * worst target-size offender in the codebase. The Sprint 3 Stream F fix
 * uses the Sprint 1 CRIT-Y1 hit-area wrapper pattern (see DeckCard Info
 * button): the outer <button> grows to 44x44 while the inner glyph stays
 * visually small via an aria-hidden span.
 *
 * This spec pins the new dimensions so a future refactor cannot silently
 * regress the drag target back to 20x20.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

// @dnd-kit/core uses DOM Range APIs unavailable in jsdom. Stub the single
// hook KanbanCard uses with a deterministic no-op shape.
jest.mock("@dnd-kit/core", () => ({
  useDraggable: jest.fn(() => ({
    attributes: {
      role: "button",
      "aria-roledescription": "draggable",
      "aria-disabled": false,
      tabIndex: 0,
    },
    listeners: {},
    setNodeRef: jest.fn(),
    isDragging: false,
  })),
}));

// next/link renders as a passthrough anchor — we don't use routing here.
jest.mock("next/link", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const MockLink = React.forwardRef<
    HTMLAnchorElement,
    React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
  >(({ href, children, ...props }, ref) => (
    <a ref={ref} href={href} {...props}>
      {children}
    </a>
  ));
  MockLink.displayName = "MockLink";
  return { __esModule: true, default: MockLink };
});

// Pass-through i18n — key is the display text.
jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      // KanbanCard uses `.replace("{title}", job.JobTitle.label)` so we
      // need to return a template string for the drag-handle label.
      if (key === "jobs.kanbanDragHandle") {
        return "Drag {title}";
      }
      return key;
    },
    locale: "en",
  })),
  formatDateShort: jest.fn(() => "Mar 20, 2026"),
}));

// Company logo is decorative here — stub to a lightweight span.
jest.mock("@/components/ui/company-logo", () => ({
  CompanyLogo: () => <span data-testid="company-logo" />,
}));

// STATUS_COLORS is a runtime lookup; provide a minimal surface so the
// card renders border classes without pulling the whole kanban hook.
jest.mock("@/hooks/useKanbanState", () => ({
  STATUS_COLORS: {
    draft: {
      border: "border-l-gray-400",
      darkBorder: "dark:border-l-gray-500",
    },
    applied: {
      border: "border-l-blue-400",
      darkBorder: "dark:border-l-blue-500",
    },
  },
}));

// -----------------------------------------------------------------------------
// Subject under test (imported after mocks)
// -----------------------------------------------------------------------------
import { KanbanCard } from "@/components/kanban/KanbanCard";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

type JobResponse = React.ComponentProps<typeof KanbanCard>["job"];

function makeJob(overrides: Partial<JobResponse> = {}): JobResponse {
  return {
    id: "job-1",
    JobTitle: { id: "t1", label: "Senior Engineer" },
    Company: { id: "c1", label: "TechCorp", logoUrl: null, logoAssetId: null },
    status: "draft",
    tags: [],
    matchScore: null,
    dueDate: null,
    ...(overrides as Partial<JobResponse>),
  } as unknown as JobResponse;
}

// -----------------------------------------------------------------------------
// M-Y-05: drag-handle target size regression guard
// -----------------------------------------------------------------------------

describe("KanbanCard — M-Y-05 drag handle target size (WCAG 2.5.5 AAA / 2.5.8 AA)", () => {
  it("renders the drag handle as a 44x44 min hit area", () => {
    const job = makeJob();
    render(<KanbanCard job={job} statusValue="draft" />);

    // The focusable native <button> owns the hit area. It is the
    // ONLY element matching the drag aria-label (template filled in).
    const handle = screen.getByRole("button", { name: /Drag Senior Engineer/i });
    expect(handle).toHaveClass("h-11");
    expect(handle).toHaveClass("w-11");
  });

  it("drag handle has a visible non-pointer feedback state (group utility)", () => {
    const job = makeJob();
    render(<KanbanCard job={job} statusValue="draft" />);
    const handle = screen.getByRole("button", { name: /Drag/i });
    // The `group` utility class is required so the inner visual span
    // can use `group-hover:*` modifiers — without it, the 44x44 hover
    // area loses feedback forwarding to the small inner glyph.
    expect(handle).toHaveClass("group");
  });

  it("drag handle carries focus-visible ring classes (keyboard focus indicator)", () => {
    const job = makeJob();
    render(<KanbanCard job={job} statusValue="draft" />);
    const handle = screen.getByRole("button", { name: /Drag/i });
    expect(handle.className).toMatch(/focus-visible:ring/);
  });

  it("inner glyph stays small (h-4 w-4) inside the hit-area wrapper", () => {
    const job = makeJob();
    render(<KanbanCard job={job} statusValue="draft" />);
    const handle = screen.getByRole("button", { name: /Drag/i });
    // The GripVertical icon is wrapped in an aria-hidden span — the
    // icon element still carries its original h-4 w-4 so the card's
    // visual compactness is preserved.
    const innerPill = handle.querySelector("span[aria-hidden='true']");
    expect(innerPill).not.toBeNull();
    // The icon lives inside that span and keeps its original size.
    const svg = innerPill?.querySelector("svg");
    expect(svg).not.toBeNull();
    // Lucide icons render with className "lucide-*" + size classes.
    expect(svg?.getAttribute("class") ?? "").toMatch(/h-4/);
    expect(svg?.getAttribute("class") ?? "").toMatch(/w-4/);
  });

  it("drag handle threads the job title into its aria-label (WCAG 4.1.2)", () => {
    const job = makeJob();
    render(<KanbanCard job={job} statusValue="draft" />);
    const handle = screen.getByRole("button", { name: /Drag Senior Engineer/i });
    expect(handle).toHaveAttribute("aria-label", "Drag Senior Engineer");
  });

  it("drag handle references the drag-drop instructions via aria-describedby", () => {
    const job = makeJob();
    render(<KanbanCard job={job} statusValue="draft" />);
    const handle = screen.getByRole("button", { name: /Drag Senior Engineer/i });
    expect(handle).toHaveAttribute("aria-describedby", "kanban-dnd-instructions");
  });
});
