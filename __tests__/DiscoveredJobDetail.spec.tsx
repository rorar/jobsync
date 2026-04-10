/**
 * DiscoveredJobDetail component tests (H-T-04)
 *
 * Coverage targets:
 *   1. Happy-path render: title, employer, location, match score, status badge.
 *   2. Null job returns null (no crash).
 *   3. Null employer/location — renders N/A fallback translation key.
 *   4. Status label i18n: translated key used, falls back to raw enum on key miss.
 *   5. External EURES link rendered when sourceUrl is present; absent otherwise.
 *   6. Footer buttons shown only for status=staged; hidden otherwise.
 *   7. Accept button: calls acceptDiscoveredJob, shows success toast, fires onOpenChange + onRefresh.
 *   8. Dismiss button: calls dismissDiscoveredJob, shows success toast, fires onOpenChange + onRefresh.
 *   9. Server action failure: error toast shown, dialog stays open.
 *  10. Automation source line rendered when automation is present.
 *  11. Accessibility: dialog role, title, description presence.
 *  12. i18n: rendering with locale=fr without crashing.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscoveredJobDetail } from "@/components/automations/DiscoveredJobDetail";
import type { DiscoveredJob } from "@/models/automation.model";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAcceptDiscoveredJob = jest.fn();
const mockDismissDiscoveredJob = jest.fn();

jest.mock("@/actions/automation.actions", () => ({
  acceptDiscoveredJob: (...args: unknown[]) =>
    mockAcceptDiscoveredJob(...args),
  dismissDiscoveredJob: (...args: unknown[]) =>
    mockDismissDiscoveredJob(...args),
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

// Pass-through i18n — key becomes the display text for deterministic assertions.
const mockT = jest.fn((key: string) => key);
jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => mockT(key),
    locale: "en",
  })),
}));

// eu-portal-urls — return a deterministic URL so we can assert href.
jest.mock("@/lib/eu-portal-urls", () => ({
  euresJobDetailUrl: (_url: string, _locale: string) =>
    "https://eures.example.com/jv/12345",
}));

// MatchDetails is a pure display component; stub it to keep the test focused.
jest.mock("@/components/automations/MatchDetails", () => ({
  MatchDetails: () => <div data-testid="match-details" />,
}));

// ScrollArea is a Radix primitive; render children directly in tests.
jest.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

// Dialog — use a lightweight stub so we control open/close without Radix portals.
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<DiscoveredJob> = {}): DiscoveredJob {
  return {
    id: "djob-1",
    userId: "user-1",
    automationId: "auto-1",
    automation: { id: "auto-1", name: "EU Tech Jobs" },
    title: "Backend Engineer",
    employerName: "Acme Corp",
    location: "Munich, Germany",
    sourceUrl: "https://europa.eu/eures/jv/12345",
    description: "Great opportunity for backend engineers.",
    matchScore: 78,
    matchData: null,
    status: "staged",
    discoveredAt: new Date("2026-04-01"),
    createdAt: new Date("2026-04-01"),
    ...overrides,
  };
}

const baseProps = {
  open: true,
  onOpenChange: jest.fn(),
  onRefresh: jest.fn(),
  matchData: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockT.mockImplementation((key: string) => key);
});

// ---------------------------------------------------------------------------
// Render: null job
// ---------------------------------------------------------------------------

describe("DiscoveredJobDetail — null job", () => {
  it("renders nothing when job is null", () => {
    const { container } = render(
      <DiscoveredJobDetail {...baseProps} job={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

// ---------------------------------------------------------------------------
// Happy-path rendering
// ---------------------------------------------------------------------------

describe("DiscoveredJobDetail — happy-path render", () => {
  it("renders the job title in the dialog", () => {
    render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
    // The DialogTitle contains the job title AND a conditional external-link
    // anchor with its own aria-label, so the heading's accessible name is
    // "Backend Engineer" concatenated with the link's aria-label. Use a
    // regex so the assertion survives the concatenation.
    expect(
      screen.getByRole("heading", { name: /Backend Engineer/ }),
    ).toBeInTheDocument();
  });

  it("renders employer name", () => {
    render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
  });

  it("renders location", () => {
    render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
    expect(screen.getByText(/Munich, Germany/)).toBeInTheDocument();
  });

  it("renders match score badge", () => {
    render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
    expect(
      screen.getByText(/78%/),
    ).toBeInTheDocument();
  });

  it("renders automation source when automation is present", () => {
    render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
    // The automation name is rendered after an i18n key prefix in the same
    // span, so exact-text match will not find it. Regex match against the
    // name alone is sufficient to prove the component rendered the field.
    expect(screen.getByText(/EU Tech Jobs/)).toBeInTheDocument();
  });

  it("omits automation source when automation is null", () => {
    render(
      <DiscoveredJobDetail
        {...baseProps}
        job={makeJob({ automation: null, automationId: null })}
      />,
    );
    expect(screen.queryByText(/EU Tech Jobs/)).not.toBeInTheDocument();
  });

  it("renders the description text", () => {
    render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
    expect(
      screen.getByText("Great opportunity for backend engineers."),
    ).toBeInTheDocument();
  });

  it("renders the MatchDetails stub", () => {
    render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
    expect(screen.getByTestId("match-details")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Null employer / location fallback
// ---------------------------------------------------------------------------

describe("DiscoveredJobDetail — null field fallback", () => {
  it("shows N/A translation key for null employerName", () => {
    render(
      <DiscoveredJobDetail
        {...baseProps}
        job={makeJob({ employerName: null })}
      />,
    );
    // The component calls t("automations.discoveredJob.notAvailable")
    expect(
      screen.getAllByText("automations.discoveredJob.notAvailable").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("shows N/A translation key for null location", () => {
    render(
      <DiscoveredJobDetail
        {...baseProps}
        job={makeJob({ location: null })}
      />,
    );
    expect(
      screen.getAllByText("automations.discoveredJob.notAvailable").length,
    ).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Status label i18n
// ---------------------------------------------------------------------------

describe("DiscoveredJobDetail — status label", () => {
  it("renders translated status when key exists", () => {
    mockT.mockImplementation((key: string) => {
      if (key === "automations.discoveredJob.status.staged") return "Staged";
      return key;
    });
    render(<DiscoveredJobDetail {...baseProps} job={makeJob({ status: "staged" })} />);
    expect(screen.getByText("Staged")).toBeInTheDocument();
  });

  it("falls back to raw enum string when translation key is missing (future-proof)", () => {
    mockT.mockImplementation((key: string) => key); // pass-through = key not found
    render(<DiscoveredJobDetail {...baseProps} job={makeJob({ status: "staged" })} />);
    // The component implementation:
    //   const translated = t(key);
    //   return translated === key ? job.status : translated;
    // So when t() passes keys through unchanged (= key not found), the badge
    // shows the raw enum value "staged" — NOT the key itself. That is the
    // future-proof behavior we're pinning here.
    expect(screen.getByText("staged")).toBeInTheDocument();
  });

  it("renders empty string for null status", () => {
    render(
      <DiscoveredJobDetail
        {...baseProps}
        job={makeJob({ status: undefined })}
      />,
    );
    // No crash; status badge area simply renders an empty string badge.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// External EURES link
// ---------------------------------------------------------------------------

describe("DiscoveredJobDetail — external link", () => {
  it("renders an ExternalLink anchor when sourceUrl is present", () => {
    render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://eures.example.com/jv/12345",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("omits the ExternalLink anchor when sourceUrl is null", () => {
    render(
      <DiscoveredJobDetail
        {...baseProps}
        job={makeJob({ sourceUrl: null })}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Footer buttons visibility based on status
// ---------------------------------------------------------------------------

describe("DiscoveredJobDetail — footer button visibility", () => {
  it("shows Accept and Dismiss buttons for status=staged", () => {
    render(<DiscoveredJobDetail {...baseProps} job={makeJob({ status: "staged" })} />);
    expect(
      screen.getByRole("button", {
        name: /automations\.discoveredJob\.acceptButton/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /automations\.discoveredJob\.dismissButton/i,
      }),
    ).toBeInTheDocument();
  });

  it("hides footer buttons for status=promoted", () => {
    render(
      <DiscoveredJobDetail
        {...baseProps}
        job={makeJob({ status: "promoted" })}
      />,
    );
    expect(
      screen.queryByRole("button", {
        name: /automations\.discoveredJob\.acceptButton/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("hides footer buttons for status=dismissed", () => {
    render(
      <DiscoveredJobDetail
        {...baseProps}
        job={makeJob({ status: "dismissed" })}
      />,
    );
    expect(
      screen.queryByRole("button", {
        name: /automations\.discoveredJob\.acceptButton/i,
      }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Accept action
// ---------------------------------------------------------------------------

describe("DiscoveredJobDetail — accept action", () => {
  it("calls acceptDiscoveredJob and fires onOpenChange + onRefresh on success", async () => {
    mockAcceptDiscoveredJob.mockResolvedValueOnce({ success: true });
    const onOpenChange = jest.fn();
    const onRefresh = jest.fn();
    render(
      <DiscoveredJobDetail
        {...baseProps}
        job={makeJob()}
        onOpenChange={onOpenChange}
        onRefresh={onRefresh}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: /automations\.discoveredJob\.acceptButton/i,
      }),
    );
    await waitFor(() => {
      expect(mockAcceptDiscoveredJob).toHaveBeenCalledWith("djob-1");
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "automations.discoveredJob.acceptedTitle",
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("shows error toast and keeps dialog open when accept fails", async () => {
    mockAcceptDiscoveredJob.mockResolvedValueOnce({
      success: false,
      message: "Something went wrong",
    });
    const onOpenChange = jest.fn();
    const onRefresh = jest.fn();
    render(
      <DiscoveredJobDetail
        {...baseProps}
        job={makeJob()}
        onOpenChange={onOpenChange}
        onRefresh={onRefresh}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: /automations\.discoveredJob\.acceptButton/i,
      }),
    );
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(onRefresh).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Dismiss action
// ---------------------------------------------------------------------------

describe("DiscoveredJobDetail — dismiss action", () => {
  it("calls dismissDiscoveredJob and fires onOpenChange + onRefresh on success", async () => {
    mockDismissDiscoveredJob.mockResolvedValueOnce({ success: true });
    const onOpenChange = jest.fn();
    const onRefresh = jest.fn();
    render(
      <DiscoveredJobDetail
        {...baseProps}
        job={makeJob()}
        onOpenChange={onOpenChange}
        onRefresh={onRefresh}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: /automations\.discoveredJob\.dismissButton/i,
      }),
    );
    await waitFor(() => {
      expect(mockDismissDiscoveredJob).toHaveBeenCalledWith("djob-1");
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "automations.discoveredJob.dismissedTitle",
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("shows error toast and keeps dialog open when dismiss fails", async () => {
    mockDismissDiscoveredJob.mockResolvedValueOnce({
      success: false,
      message: "Network error",
    });
    const onOpenChange = jest.fn();
    render(
      <DiscoveredJobDetail
        {...baseProps}
        job={makeJob()}
        onOpenChange={onOpenChange}
        onRefresh={jest.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: /automations\.discoveredJob\.dismissButton/i,
      }),
    );
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe("DiscoveredJobDetail — accessibility", () => {
  it("dialog has role=dialog", () => {
    render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("dialog heading matches the job title", () => {
    render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
    // L-NEW-02 (Sprint 4 Stream E): DialogTitle now contains ONLY the
    // job title. The external-link anchor is a sibling inside
    // DialogHeader but outside DialogTitle, so the dialog's accessible
    // name is exactly the job title (no link role concatenation).
    expect(
      screen.getByRole("heading", { name: "Backend Engineer" }),
    ).toBeInTheDocument();
  });

  it("renders nothing (no dialog role) when open=false", () => {
    render(
      <DiscoveredJobDetail {...baseProps} job={makeJob()} open={false} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Sprint 4 Stream E — L-NEW-02: external-link anchor is NOT nested in title
  // ---------------------------------------------------------------------------
  describe("L-NEW-02 — external-link anchor outside DialogTitle", () => {
    it("the external-link anchor is not a descendant of the heading", () => {
      render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);

      const heading = screen.getByRole("heading", {
        name: "Backend Engineer",
      });
      const link = screen.getByRole("link");

      // Regression guard: the old DOM shape nested the <a> inside
      // DialogTitle, which polluted the dialog's accessible name with
      // the anonymous link role. The fix moves the anchor to a
      // DialogHeader sibling row.
      expect(heading.contains(link)).toBe(false);
    });

    it("the heading's accessible name is exactly the job title (no link role concat)", () => {
      render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
      // Exact-match assertion (not a regex) — proves the DialogTitle's
      // accessible name contains no trailing "link" / anchor text.
      const heading = screen.getByRole("heading", {
        name: "Backend Engineer",
      });
      expect(heading.textContent).toBe("Backend Engineer");
    });
  });
});

// ---------------------------------------------------------------------------
// i18n — locale=fr
// ---------------------------------------------------------------------------

describe("DiscoveredJobDetail — i18n locale=fr", () => {
  it("renders without crashing with locale=fr", () => {
    const { useTranslations } = jest.requireMock("@/i18n") as {
      useTranslations: jest.MockedFunction<
        () => { t: (k: string) => string; locale: string }
      >;
    };
    useTranslations.mockReturnValueOnce({
      t: (key: string) => `[fr] ${key}`,
      locale: "fr",
    });
    render(<DiscoveredJobDetail {...baseProps} job={makeJob()} />);
    expect(
      screen.getByText("Backend Engineer"),
    ).toBeInTheDocument();
    // A translated string confirms the French t() was invoked.
    expect(
      screen.getByText(/\[fr\] automations\.discoveredJob\.descriptionHeading/),
    ).toBeInTheDocument();
  });
});
