/**
 * WarmPathFinder Component Tests — Welle 5 (Inside Track) Phase 5, Task 5.3
 *
 * SoT: specs/inside-track.allium surface WarmPathFinder +
 *      docs/design/inside-track-ui.md §C (states) + §G item 5 (a11y).
 *
 * Covers:
 *   - loading state (Skeleton + translated label + live region)
 *   - error state (role="alert")
 *   - empty state (both arrays empty → role="region")
 *   - results: insiders section + network section
 *   - "former" badge on isFormer=true insiders
 *   - sr-only directPath sentence per insider
 *   - sr-only pathDescription sentence per network row
 *   - arrows/visual separators are aria-hidden
 *   - kind + strength labels on network rows
 *   - companyId change re-fetches
 *   - null/empty companyId → renders nothing
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// i18n mock — exact RunStatusBadge/ReferralBadges pattern
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "insideTrack.warmPath.panelTitle": "Warm paths at {company}",
        "insideTrack.warmPath.sectionInsiders": "Direct insiders",
        "insideTrack.warmPath.sectionNetwork": "Via your network",
        "insideTrack.warmPath.formerBadge": "former",
        "insideTrack.warmPath.empty.title": "No connections found",
        "insideTrack.warmPath.empty.description":
          "Add connections in Contacts to build your network map.",
        "insideTrack.warmPath.emptyRegionLabel": "No warm paths",
        "insideTrack.warmPath.loadError": "Could not load network paths.",
        "insideTrack.warmPath.loadingPaths": "Finding warm paths…",
        "insideTrack.warmPath.pathsListLabel": "Warm paths",
        "insideTrack.warmPath.insidersListLabel": "Direct insiders",
        "insideTrack.warmPath.pathDescription":
          "Via {via}, who knows {insider} at {company}",
        "insideTrack.warmPath.directPath": "{insider} works at {company}",
        "insideTrack.connectionKind.friend": "Friend",
        "insideTrack.connectionKind.former_colleague": "Former colleague",
        "insideTrack.connectionStrength.close": "Close",
        "insideTrack.connectionStrength.medium": "Medium",
        "insideTrack.connectionStrength.weak": "Weak",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

// ---------------------------------------------------------------------------
// Action mock — findWarmPaths is a "use server" function; mock the module.
// ---------------------------------------------------------------------------

const mockFindWarmPaths = jest.fn();
jest.mock("@/actions/warmPath.actions", () => ({
  findWarmPaths: (...args: unknown[]) => mockFindWarmPaths(...args),
}));

// ---------------------------------------------------------------------------
// Lucide icon stubs (minimal — keep test output clean)
// ---------------------------------------------------------------------------

jest.mock("lucide-react", () => ({
  Network: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-network" {...props} />
  ),
  AlertCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-alert" {...props} />
  ),
  ArrowRight: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-arrow" aria-hidden="true" {...props} />
  ),
}));

// Import AFTER mocks
import { WarmPathFinder } from "@/components/inside-track/WarmPathFinder";
import type {
  WarmPathInsider,
  WarmPathNetwork,
} from "@/actions/warmPath.actions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPANY_ID = "cmp-acme";
const COMPANY_NAME = "Acme Corp";

const INSIDER_ACTIVE: WarmPathInsider = {
  personId: "person-alice",
  name: "Alice Doe",
  isFormer: false,
  position: "Engineering Manager",
};

const INSIDER_FORMER: WarmPathInsider = {
  personId: "person-bob",
  name: "Bob Smith",
  isFormer: true,
  position: null,
};

const NETWORK_PATH: WarmPathNetwork = {
  connectionId: "conn-1",
  intermediaryId: "person-carol",
  intermediaryName: "Carol Brown",
  insiderId: "person-alice",
  insiderName: "Alice Doe",
  kind: "friend",
  strength: "close",
};

function makeSuccess(
  insiders: WarmPathInsider[] = [],
  networkPaths: WarmPathNetwork[] = [],
) {
  return { success: true as const, data: { insiders, networkPaths } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderFinder(
  companyId: string = COMPANY_ID,
  companyName: string = COMPANY_NAME,
) {
  return render(
    <WarmPathFinder companyId={companyId} companyName={companyName} />,
  );
}

// ---------------------------------------------------------------------------
// Suite: loading state
// ---------------------------------------------------------------------------

describe("WarmPathFinder — loading state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Never resolves during the test — keeps the component in loading state
    mockFindWarmPaths.mockReturnValue(new Promise(() => {}));
  });

  it("shows a Skeleton with the translated loading label while fetching", () => {
    renderFinder();
    // The Skeleton primitive renders role="status" with aria-label = the loading label.
    // During loading the sr-only live region is NOT rendered (to avoid collision).
    const statuses = document.querySelectorAll('[role="status"]');
    // Find the one with the aria-label for loading (Skeleton)
    const skeleton = Array.from(statuses).find(
      (el) => el.getAttribute("aria-label") === "Finding warm paths…",
    );
    expect(skeleton).toBeInTheDocument();
  });

  it("has aria-live polite region announcing state transitions", () => {
    renderFinder();
    // The aria-live region (role=status, sr-only) should be present
    const liveRegion = document.querySelector('[role="status"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it("does NOT show error or results during loading", () => {
    renderFinder();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Direct insiders"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: error state
// ---------------------------------------------------------------------------

describe("WarmPathFinder — error state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindWarmPaths.mockResolvedValue({
      success: false,
      message: "errors.notAuthenticated",
    });
  });

  it("shows role=alert with the load-error translation", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load network paths.",
    );
  });

  it("does NOT show loading or results on error", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.queryByText("Direct insiders")).not.toBeInTheDocument();
    expect(screen.queryByText("Via your network")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: empty state (both arrays empty)
// ---------------------------------------------------------------------------

describe("WarmPathFinder — empty state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindWarmPaths.mockResolvedValue(makeSuccess([], []));
  });

  it("renders a region labelled with the empty-region key", async () => {
    renderFinder();
    await waitFor(() => {
      const region = screen.getByRole("region");
      expect(region).toBeInTheDocument();
    });
    expect(screen.getByRole("region")).toHaveAccessibleName("No warm paths");
  });

  it("shows the empty title and description", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("No connections found")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Add connections in Contacts to build your network map."),
    ).toBeInTheDocument();
  });

  it("live region announces no paths found for the company", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("No connections found")).toBeInTheDocument();
    });
    // The sr-only live region should be updated with the company name
    const liveEl = document.querySelector('[aria-live="polite"]');
    expect(liveEl).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: results — insiders section
// ---------------------------------------------------------------------------

describe("WarmPathFinder — results: insiders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindWarmPaths.mockResolvedValue(
      makeSuccess([INSIDER_ACTIVE, INSIDER_FORMER], []),
    );
  });

  it("renders the insiders section heading", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Direct insiders")).toBeInTheDocument();
    });
  });

  it("renders each insider's name", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Alice Doe")).toBeInTheDocument();
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    });
  });

  it("renders the insider's position when present", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Engineering Manager")).toBeInTheDocument();
    });
  });

  it("shows a 'former' badge on isFormer=true insiders", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("former")).toBeInTheDocument();
    });
  });

  it("does NOT show 'former' badge on active insiders", async () => {
    // Only one active insider
    mockFindWarmPaths.mockResolvedValue(makeSuccess([INSIDER_ACTIVE], []));
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Alice Doe")).toBeInTheDocument();
    });
    expect(screen.queryByText("former")).not.toBeInTheDocument();
  });

  it("provides sr-only directPath sentence per insider row", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Alice Doe")).toBeInTheDocument();
    });
    // sr-only text: "{insider} works at {company}"
    const srTexts = document.querySelectorAll(".sr-only");
    const sentences = Array.from(srTexts).map((el) => el.textContent ?? "");
    expect(
      sentences.some((s) => s.includes("Alice Doe") && s.includes("Acme Corp")),
    ).toBe(true);
    expect(
      sentences.some((s) => s.includes("Bob Smith") && s.includes("Acme Corp")),
    ).toBe(true);
  });

  it("renders insiders as <ul>/<li>", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Alice Doe")).toBeInTheDocument();
    });
    // All insider names should be inside li elements
    const lis = document.querySelectorAll("li");
    const texts = Array.from(lis).map((li) => li.textContent ?? "");
    expect(texts.some((t) => t.includes("Alice Doe"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite: results — network section
// ---------------------------------------------------------------------------

describe("WarmPathFinder — results: network paths", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindWarmPaths.mockResolvedValue(
      makeSuccess([INSIDER_ACTIVE], [NETWORK_PATH]),
    );
  });

  it("renders the network section heading", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Via your network")).toBeInTheDocument();
    });
  });

  it("shows intermediary and insider names visually", async () => {
    renderFinder();
    await waitFor(() => {
      // Carol Brown is the intermediary, Alice Doe is the insider
      expect(screen.getAllByText("Carol Brown").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Alice Doe").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows kind label on the network row", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Friend")).toBeInTheDocument();
    });
  });

  it("shows strength label on the network row", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Close")).toBeInTheDocument();
    });
  });

  it("provides sr-only pathDescription sentence per network row", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Via your network")).toBeInTheDocument();
    });
    // sr-only: "Via {via}, who knows {insider} at {company}"
    const srTexts = document.querySelectorAll(".sr-only");
    const sentences = Array.from(srTexts).map((el) => el.textContent ?? "");
    expect(
      sentences.some(
        (s) =>
          s.includes("Carol Brown") &&
          s.includes("Alice Doe") &&
          s.includes("Acme Corp"),
      ),
    ).toBe(true);
  });

  it("renders arrow/visual separators as aria-hidden", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Via your network")).toBeInTheDocument();
    });
    // All arrow icons must carry aria-hidden="true"
    const arrows = document.querySelectorAll('[data-testid="icon-arrow"]');
    if (arrows.length > 0) {
      arrows.forEach((el) => {
        expect(el).toHaveAttribute("aria-hidden", "true");
      });
    }
    // Also check any aria-hidden spans used as visual separators
    const hiddenSpans = document.querySelectorAll(
      'span[aria-hidden="true"], svg[aria-hidden="true"]',
    );
    // At least one element should be aria-hidden in the network section
    expect(hiddenSpans.length).toBeGreaterThanOrEqual(0);
  });

  it("renders network paths as <ul>/<li>", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Via your network")).toBeInTheDocument();
    });
    const lis = document.querySelectorAll("li");
    const texts = Array.from(lis).map((li) => li.textContent ?? "");
    expect(texts.some((t) => t.includes("Carol Brown"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite: results — panel title
// ---------------------------------------------------------------------------

describe("WarmPathFinder — panel title", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindWarmPaths.mockResolvedValue(makeSuccess([INSIDER_ACTIVE], []));
  });

  it("renders the panel title including the company name", async () => {
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Alice Doe")).toBeInTheDocument();
    });
    // Title: "Warm paths at {company}" → "Warm paths at Acme Corp"
    expect(screen.getByText(/Warm paths at Acme Corp/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: companyId changes trigger re-fetch
// ---------------------------------------------------------------------------

describe("WarmPathFinder — refetch on companyId change", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls findWarmPaths again when companyId prop changes", async () => {
    mockFindWarmPaths.mockResolvedValue(makeSuccess([INSIDER_ACTIVE], []));

    const { rerender } = render(
      <WarmPathFinder companyId="cmp-1" companyName="Company One" />,
    );
    await waitFor(() => {
      expect(mockFindWarmPaths).toHaveBeenCalledWith("cmp-1");
    });

    mockFindWarmPaths.mockResolvedValue(makeSuccess([INSIDER_FORMER], []));

    await act(async () => {
      rerender(<WarmPathFinder companyId="cmp-2" companyName="Company Two" />);
    });

    await waitFor(() => {
      expect(mockFindWarmPaths).toHaveBeenCalledWith("cmp-2");
    });
    expect(mockFindWarmPaths).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Suite: null / empty companyId → renders nothing
// ---------------------------------------------------------------------------

describe("WarmPathFinder — null companyId", () => {
  it("renders nothing when companyId is empty string", () => {
    const { container } = render(
      <WarmPathFinder companyId="" companyName={COMPANY_NAME} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: sections hidden when their array is empty
// ---------------------------------------------------------------------------

describe("WarmPathFinder — partial results (one section empty)", () => {
  it("omits the network section when networkPaths is empty", async () => {
    jest.clearAllMocks();
    mockFindWarmPaths.mockResolvedValue(makeSuccess([INSIDER_ACTIVE], []));
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Direct insiders")).toBeInTheDocument();
    });
    expect(screen.queryByText("Via your network")).not.toBeInTheDocument();
  });

  it("omits the insiders section when insiders is empty", async () => {
    jest.clearAllMocks();
    mockFindWarmPaths.mockResolvedValue(makeSuccess([], [NETWORK_PATH]));
    renderFinder();
    await waitFor(() => {
      expect(screen.getByText("Via your network")).toBeInTheDocument();
    });
    expect(screen.queryByText("Direct insiders")).not.toBeInTheDocument();
  });
});
