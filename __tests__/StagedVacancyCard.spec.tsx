/**
 * StagedVacancyCard component tests (H-T-04 / H-T-06)
 *
 * Coverage targets:
 *   1. Happy-path render — title, employer, location, source badge, date.
 *   2. Details button presence and `onOpenDetails(vacancy)` callback.
 *   3. Body click fires `onOpenDetails` (mouse path).
 *   4. Action buttons do NOT propagate through the body handler (stopPropagation).
 *   5. Per-tab action button rendering (new / dismissed / archive / trash).
 *   6. Block-company button conditionally rendered.
 *   7. Accessibility: Info button has an accessible name; role invariant.
 *   8. i18n: key rendering with a non-English locale.
 *   9. Null field graceful degradation.
 *  10. Selection checkbox behaviour.
 *
 * H-T-06 invariant: if the body is interactive (`onOpenDetails` supplied) the
 * Info button MUST be present with an accessible name. This test pins that
 * contract so a future refactor that hides the Info button while keeping the
 * body handler would be caught immediately.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { StagedVacancyCard } from "@/components/staging/StagedVacancyCard";
import { mockStagedVacancy } from "@/lib/data/testFixtures";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Pass-through i18n — key is the display text so assertions are locale-stable.
jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) {
        return Object.entries(params).reduce(
          (acc, [k, v]) => acc.replace(`{${k}}`, v),
          key,
        );
      }
      return key;
    },
    locale: "en",
  })),
  formatDateShort: jest.fn(() => "Mar 20, 2026"),
}));

// CompanyLogo depends on next/image under the hood — stub it to an empty
// testid span. We deliberately DO NOT render `companyName` as children
// because the real component renders the employer name as a sibling text
// node elsewhere in the card, and duplicating it inside the logo stub
// would make `getByText(...)` ambiguous (multi-match).
jest.mock("@/components/ui/company-logo", () => ({
  CompanyLogo: () => <span data-testid="company-logo" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVacancy(
  overrides: Partial<StagedVacancyWithAutomation> = {},
): StagedVacancyWithAutomation {
  return {
    ...mockStagedVacancy,
    automation: { id: "auto-1", name: "EU Tech Jobs" },
    ...overrides,
  };
}

const baseHandlers = {
  onDismiss: jest.fn(),
  onRestore: jest.fn(),
  onArchive: jest.fn(),
  onTrash: jest.fn(),
  onRestoreFromTrash: jest.fn(),
  onPromote: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Happy-path rendering
// ---------------------------------------------------------------------------

describe("StagedVacancyCard — happy-path render", () => {
  it("renders the vacancy title", () => {
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(
      screen.getByText("Senior Software Engineer"),
    ).toBeInTheDocument();
  });

  it("renders employer name", () => {
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(screen.getByText("TechCorp GmbH")).toBeInTheDocument();
  });

  it("renders location", () => {
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(screen.getByText("Berlin, Germany")).toBeInTheDocument();
  });

  it("renders source board badge", () => {
    const vacancy = makeVacancy({ sourceBoard: "EURES" });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(screen.getByText("EURES")).toBeInTheDocument();
  });

  it("renders formatted discovery date", () => {
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(screen.getByText("Mar 20, 2026")).toBeInTheDocument();
  });

  it("renders automation source line", () => {
    const vacancy = makeVacancy({ automation: { id: "a1", name: "EU Tech" } });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    // t("staging.source") renders the key "staging.source"
    expect(screen.getByText(/staging\.source/)).toBeInTheDocument();
    expect(screen.getByText(/EU Tech/)).toBeInTheDocument();
  });

  it("renders match score badge when present", () => {
    const vacancy = makeVacancy({ matchScore: 92 });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(screen.getByText(/92%/)).toBeInTheDocument();
  });

  it("omits match score badge when matchScore is null", () => {
    const vacancy = makeVacancy({ matchScore: null });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Null / missing field graceful degradation
// ---------------------------------------------------------------------------

describe("StagedVacancyCard — null field handling", () => {
  it("omits employer block when employerName is null", () => {
    const vacancy = makeVacancy({ employerName: null });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(screen.queryByTestId("company-logo")).not.toBeInTheDocument();
  });

  it("omits location span when location is null", () => {
    const vacancy = makeVacancy({ location: null });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(screen.queryByText("Berlin, Germany")).not.toBeInTheDocument();
  });

  it("omits automation line when automation is null", () => {
    const vacancy = makeVacancy({ automation: null });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(screen.queryByText(/staging\.source/)).not.toBeInTheDocument();
  });

  it("still renders title when most fields are null", () => {
    const vacancy = makeVacancy({
      employerName: null,
      location: null,
      automation: null,
      matchScore: null,
    });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(
      screen.getByText("Senior Software Engineer"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Details button and onOpenDetails callback (H-T-06 invariant)
// ---------------------------------------------------------------------------

describe("StagedVacancyCard — Details button (H-T-06)", () => {
  it("does not render a Details button when onOpenDetails is omitted", () => {
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    // The button has aria-label staging.details: <title>
    expect(
      screen.queryByRole("button", { name: /staging\.details/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a Details button with an accessible name when onOpenDetails is supplied", () => {
    const vacancy = makeVacancy();
    const onOpenDetails = jest.fn();
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onOpenDetails={onOpenDetails}
      />,
    );
    // aria-label is "staging.details: Senior Software Engineer"
    const detailsBtn = screen.getByRole("button", {
      name: /staging\.details/i,
    });
    expect(detailsBtn).toBeInTheDocument();
  });

  it("calls onOpenDetails(vacancy) when the Details button is clicked", () => {
    const vacancy = makeVacancy();
    const onOpenDetails = jest.fn();
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onOpenDetails={onOpenDetails}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /staging\.details/i }),
    );
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
    expect(onOpenDetails).toHaveBeenCalledWith(vacancy);
  });

  /**
   * Sprint 2 H-T-06 fix: the previous implementation attached `onClick`
   * to a `role="presentation"` body wrapper — mouse-only, invisible to
   * keyboard users (WCAG 2.1.1). The fix removes the body click handler
   * entirely and relies on the explicit Details button as the sole
   * keyboard-accessible entry point. This test pins the new contract:
   * clicking the body must NOT fire `onOpenDetails`.
   */
  it("H-T-06: card body click does NOT fire onOpenDetails (body is non-interactive)", () => {
    const vacancy = makeVacancy();
    const onOpenDetails = jest.fn();
    const { container } = render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onOpenDetails={onOpenDetails}
      />,
    );
    // The body wrapper no longer has a click handler or role="presentation".
    // It's a plain <div> without an interactive role.
    const title = screen.getByText("Senior Software Engineer");
    fireEvent.click(title);
    expect(onOpenDetails).not.toHaveBeenCalled();

    // Defensive: no element in the card tree carries the old
    // `role="presentation"` marker — making this change visible in tests.
    expect(
      container.querySelector('[role="presentation"]'),
    ).toBeNull();
  });

  /**
   * H-T-06 invariant: the Details button is the sole keyboard-accessible
   * entry point to the detail sheet. Whenever `onOpenDetails` is supplied,
   * this button MUST exist with an accessible name carrying the vacancy
   * title (H-NEW-04 per-vacancy context requirement).
   */
  it("H-T-06 invariant: keyboard-accessible Details button is the ONLY entry point", () => {
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onOpenDetails={jest.fn()}
      />,
    );
    // The Details button is the keyboard-accessible equivalent and MUST exist.
    const detailsButton = screen.getByRole("button", {
      name: /staging\.details/i,
    });
    expect(detailsButton).toBeInTheDocument();
    // It must have a non-empty accessible name (not just an icon).
    expect(detailsButton.getAttribute("aria-label")).toBeTruthy();
    // And the button itself must be keyboard-focusable (a native <button>).
    expect(detailsButton.tagName).toBe("BUTTON");
  });
});

// ---------------------------------------------------------------------------
// stopPropagation: action buttons must not bubble to the body handler
// ---------------------------------------------------------------------------

describe("StagedVacancyCard — action button stopPropagation", () => {
  it("clicking Promote does NOT fire onOpenDetails", () => {
    const vacancy = makeVacancy();
    const onOpenDetails = jest.fn();
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onOpenDetails={onOpenDetails}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /staging\.promote/i }));
    expect(onOpenDetails).not.toHaveBeenCalled();
    expect(baseHandlers.onPromote).toHaveBeenCalledWith(vacancy);
  });

  it("clicking Dismiss does NOT fire onOpenDetails", () => {
    const vacancy = makeVacancy();
    const onOpenDetails = jest.fn();
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onOpenDetails={onOpenDetails}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /staging\.dismiss/i }));
    expect(onOpenDetails).not.toHaveBeenCalled();
    expect(baseHandlers.onDismiss).toHaveBeenCalledWith(vacancy.id);
  });

  it("clicking Archive does NOT fire onOpenDetails", () => {
    const vacancy = makeVacancy();
    const onOpenDetails = jest.fn();
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onOpenDetails={onOpenDetails}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /staging\.archive/i }));
    expect(onOpenDetails).not.toHaveBeenCalled();
    expect(baseHandlers.onArchive).toHaveBeenCalledWith(vacancy.id);
  });

  it("clicking Trash does NOT fire onOpenDetails", () => {
    const vacancy = makeVacancy();
    const onOpenDetails = jest.fn();
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onOpenDetails={onOpenDetails}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /staging\.trash/i }));
    expect(onOpenDetails).not.toHaveBeenCalled();
    expect(baseHandlers.onTrash).toHaveBeenCalledWith(vacancy.id);
  });
});

// ---------------------------------------------------------------------------
// Per-tab action button rendering
// ---------------------------------------------------------------------------

describe("StagedVacancyCard — tab-specific buttons", () => {
  it("shows Promote, Dismiss, Archive, Trash for activeTab=new", () => {
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(
      screen.getByRole("button", { name: /staging\.promote/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /staging\.dismiss/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /staging\.archive/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /staging\.trash/i }),
    ).toBeInTheDocument();
    // Restore must NOT appear for "new" tab
    expect(
      screen.queryByRole("button", { name: /staging\.restore/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Restore and Trash for activeTab=dismissed", () => {
    const vacancy = makeVacancy({ status: "dismissed" });
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="dismissed"
      />,
    );
    expect(
      screen.getByRole("button", { name: /staging\.restore/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /staging\.trash/i }),
    ).toBeInTheDocument();
    // Promote must NOT appear for "dismissed" tab
    expect(
      screen.queryByRole("button", { name: /staging\.promote/i }),
    ).not.toBeInTheDocument();
  });

  it("shows only Restore for activeTab=archive", () => {
    const vacancy = makeVacancy({ status: "staged" });
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="archive"
      />,
    );
    expect(
      screen.getByRole("button", { name: /staging\.restore/i }),
    ).toBeInTheDocument();
    // Trash must NOT appear for "archive" tab
    expect(
      screen.queryByRole("button", { name: /staging\.trash/i }),
    ).not.toBeInTheDocument();
  });

  it("shows only Restore for activeTab=trash", () => {
    const vacancy = makeVacancy({ status: "staged" });
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="trash"
      />,
    );
    const restoreBtn = screen.getByRole("button", {
      name: /staging\.restore/i,
    });
    expect(restoreBtn).toBeInTheDocument();
    fireEvent.click(restoreBtn);
    expect(baseHandlers.onRestoreFromTrash).toHaveBeenCalledWith(vacancy.id);
  });
});

// ---------------------------------------------------------------------------
// Block-company button
// ---------------------------------------------------------------------------

describe("StagedVacancyCard — block company", () => {
  it("renders block button when onBlockCompany and employerName are present", () => {
    const onBlockCompany = jest.fn();
    const vacancy = makeVacancy({ employerName: "BadCorp" });
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onBlockCompany={onBlockCompany}
      />,
    );
    const blockBtn = screen.getByRole("button", {
      name: /blacklist\.blockCompany/i,
    });
    expect(blockBtn).toBeInTheDocument();
    fireEvent.click(blockBtn);
    expect(onBlockCompany).toHaveBeenCalledWith("BadCorp");
  });

  it("omits block button when employerName is null", () => {
    const onBlockCompany = jest.fn();
    const vacancy = makeVacancy({ employerName: null });
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onBlockCompany={onBlockCompany}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /blacklist\.blockCompany/i }),
    ).not.toBeInTheDocument();
  });

  it("omits block button when onBlockCompany is not supplied", () => {
    const vacancy = makeVacancy({ employerName: "BadCorp" });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(
      screen.queryByRole("button", { name: /blacklist\.blockCompany/i }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Selection checkbox
// ---------------------------------------------------------------------------

describe("StagedVacancyCard — selection checkbox", () => {
  it("renders a checkbox when onToggleSelect is supplied", () => {
    const onToggleSelect = jest.fn();
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onToggleSelect={onToggleSelect}
      />,
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it("shows checkbox as checked when selected=true", () => {
    const onToggleSelect = jest.fn();
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onToggleSelect={onToggleSelect}
        selected
      />,
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("calls onToggleSelect with the vacancy id on checkbox change", () => {
    const onToggleSelect = jest.fn();
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onToggleSelect={onToggleSelect}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleSelect).toHaveBeenCalledWith(vacancy.id);
  });

  it("checkbox click does NOT fire onOpenDetails", () => {
    const onToggleSelect = jest.fn();
    const onOpenDetails = jest.fn();
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onToggleSelect={onToggleSelect}
        onOpenDetails={onOpenDetails}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it("omits checkbox when onToggleSelect is not supplied", () => {
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// i18n rendering with a non-English locale
// ---------------------------------------------------------------------------

describe("StagedVacancyCard — i18n", () => {
  it("renders with locale=de without crashing", () => {
    const { useTranslations } = jest.requireMock("@/i18n") as {
      useTranslations: jest.MockedFunction<() => { t: (k: string) => string; locale: string }>;
    };
    useTranslations.mockReturnValueOnce({
      t: (key: string) => `[de] ${key}`,
      locale: "de",
    });
    const vacancy = makeVacancy();
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    // Title is raw data, not translated — it should still appear.
    expect(
      screen.getByText("Senior Software Engineer"),
    ).toBeInTheDocument();
    // A translated string confirms the German t() was called.
    expect(screen.getByText(/\[de\] staging\.promote/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sprint 2 H-NEW-04 — per-vacancy aria-label context
//
// Every footer button now threads the vacancy title (and employer name
// when present) through `aria-label` so screen reader users can
// disambiguate "Promote: Senior Engineer at TechCorp" from "Promote:
// Senior Engineer at Another Co". These tests pin the honest contract:
// every button carries the vacancy context, and the context includes
// the employer when available.
// ---------------------------------------------------------------------------

describe("StagedVacancyCard — H-NEW-04 per-vacancy aria-labels", () => {
  function expectAriaLabelIncludes(label: string, needle: string) {
    expect(label).toBeTruthy();
    expect(label).toEqual(expect.stringContaining(needle));
  }

  it("Details button aria-label includes the vacancy title and employer", () => {
    const vacancy = makeVacancy({
      title: "Senior Software Engineer",
      employerName: "TechCorp GmbH",
    });
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onOpenDetails={jest.fn()}
      />,
    );
    const label =
      screen.getByRole("button", { name: /staging\.details/i }).getAttribute("aria-label") ?? "";
    expectAriaLabelIncludes(label, "Senior Software Engineer");
    expectAriaLabelIncludes(label, "TechCorp GmbH");
  });

  it("Promote button aria-label includes the vacancy title and employer", () => {
    const vacancy = makeVacancy({
      title: "Backend Developer",
      employerName: "AcmeCo",
    });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    const label =
      screen.getByRole("button", { name: /staging\.promote/i }).getAttribute("aria-label") ?? "";
    expectAriaLabelIncludes(label, "Backend Developer");
    expectAriaLabelIncludes(label, "AcmeCo");
  });

  it("Dismiss button aria-label includes the vacancy title", () => {
    const vacancy = makeVacancy({ title: "Frontend Dev" });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    const label =
      screen.getByRole("button", { name: /staging\.dismiss/i }).getAttribute("aria-label") ?? "";
    expectAriaLabelIncludes(label, "Frontend Dev");
  });

  it("Archive button aria-label includes the vacancy title", () => {
    const vacancy = makeVacancy({ title: "DevOps Engineer" });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    const label =
      screen.getByRole("button", { name: /staging\.archive/i }).getAttribute("aria-label") ?? "";
    expectAriaLabelIncludes(label, "DevOps Engineer");
  });

  it("Trash button aria-label includes the vacancy title", () => {
    const vacancy = makeVacancy({ title: "Data Scientist" });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="new" />,
    );
    const label =
      screen.getByRole("button", { name: /staging\.trash/i }).getAttribute("aria-label") ?? "";
    expectAriaLabelIncludes(label, "Data Scientist");
  });

  it("Block button aria-label includes the employer name", () => {
    const vacancy = makeVacancy({ employerName: "BadCorp Ltd" });
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onBlockCompany={jest.fn()}
      />,
    );
    const label =
      screen
        .getByRole("button", { name: /blacklist\.blockCompany/i })
        .getAttribute("aria-label") ?? "";
    expectAriaLabelIncludes(label, "BadCorp Ltd");
  });

  it("Restore button (dismissed tab) aria-label includes the vacancy title", () => {
    const vacancy = makeVacancy({
      title: "Mobile Developer",
      status: "dismissed",
    });
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="dismissed"
      />,
    );
    const label =
      screen.getByRole("button", { name: /staging\.restore/i }).getAttribute("aria-label") ?? "";
    expectAriaLabelIncludes(label, "Mobile Developer");
  });

  it("Restore button (archive tab) aria-label includes the vacancy title", () => {
    const vacancy = makeVacancy({ title: "Cloud Engineer" });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="archive" />,
    );
    const label =
      screen.getByRole("button", { name: /staging\.restore/i }).getAttribute("aria-label") ?? "";
    expectAriaLabelIncludes(label, "Cloud Engineer");
  });

  it("Restore button (trash tab) aria-label includes the vacancy title", () => {
    const vacancy = makeVacancy({ title: "Security Engineer" });
    render(
      <StagedVacancyCard {...baseHandlers} vacancy={vacancy} activeTab="trash" />,
    );
    const label =
      screen.getByRole("button", { name: /staging\.restore/i }).getAttribute("aria-label") ?? "";
    expectAriaLabelIncludes(label, "Security Engineer");
  });

  it("gracefully omits employer from aria-label when employerName is null", () => {
    const vacancy = makeVacancy({
      title: "Unnamed Employer Role",
      employerName: null,
    });
    render(
      <StagedVacancyCard
        {...baseHandlers}
        vacancy={vacancy}
        activeTab="new"
        onOpenDetails={jest.fn()}
      />,
    );
    const label =
      screen.getByRole("button", { name: /staging\.details/i }).getAttribute("aria-label") ?? "";
    // Title still threaded, no crash from missing employer.
    expectAriaLabelIncludes(label, "Unnamed Employer Role");
    // Label must not contain " — " separator or a stale "null" token.
    expect(label).not.toEqual(expect.stringContaining("null"));
    expect(label).not.toEqual(expect.stringContaining("undefined"));
  });

  it("two cards in parallel produce DISTINCT aria-labels (the core H-NEW-04 guarantee)", () => {
    // The exact bug H-NEW-04 fixes: if labels were generic ("Promote",
    // "Dismiss", ...), a screen-reader user tabbing through a list of
    // 20 cards hears the same label 20 times. After the fix, each
    // card's buttons carry the vacancy context — so the labels MUST
    // differ between two distinct cards.
    const a = makeVacancy({
      title: "Alpha Engineer",
      employerName: "AlphaCo",
    });
    const b = makeVacancy({
      title: "Beta Engineer",
      employerName: "BetaCo",
    });
    const { rerender } = render(
      <StagedVacancyCard {...baseHandlers} vacancy={a} activeTab="new" />,
    );
    const labelA =
      screen.getByRole("button", { name: /staging\.promote/i }).getAttribute("aria-label") ?? "";

    rerender(
      <StagedVacancyCard {...baseHandlers} vacancy={b} activeTab="new" />,
    );
    const labelB =
      screen.getByRole("button", { name: /staging\.promote/i }).getAttribute("aria-label") ?? "";

    expect(labelA).not.toEqual(labelB);
    expect(labelA).toEqual(expect.stringContaining("AlphaCo"));
    expect(labelB).toEqual(expect.stringContaining("BetaCo"));
  });
});
