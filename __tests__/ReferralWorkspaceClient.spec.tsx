/**
 * ReferralWorkspaceClient — Inside Track workspace (Welle 5, Task 5.2).
 * Integration: orchestrates getReferral + status-gated actions + the real
 * lifecycle rail + action bar. Verifies the a11y contract (live region +
 * focus-to-status-display after a transition) and terminal banners.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/i18n", () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: "en" }),
  formatDateShort: () => "Jun 1, 2026",
}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

const getReferral = jest.fn();
const engageReferral = jest.fn();
jest.mock("@/actions/referral.actions", () => ({
  getReferral: (...a: unknown[]) => getReferral(...a),
  engageReferral: (...a: unknown[]) => engageReferral(...a),
  relayReferral: jest.fn(),
  reviewReferral: jest.fn(),
  commitReferralToApply: jest.fn(),
  reviveReferral: jest.fn(),
  declineReferral: jest.fn(),
}));

// WarmPathFinder self-fetches; stub it.
jest.mock("@/components/inside-track/WarmPathFinder", () => ({
  WarmPathFinder: () => <div data-testid="warmpath" />,
}));

jest.mock("lucide-react", () =>
  new Proxy({}, { get: () => (p: React.SVGProps<SVGSVGElement>) => <svg {...p} /> }),
);

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

import ReferralWorkspaceClient from "@/app/dashboard/referrals/[id]/ReferralWorkspaceClient";

const detail = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  kind: "insider_relay",
  status: "open",
  receivedAt: new Date("2026-06-01"),
  lastActivityAt: new Date("2026-06-01"),
  createdAt: new Date("2026-06-01"),
  updatedAt: new Date("2026-06-01"),
  updatedByType: null,
  updatedById: null,
  tipster: { id: "p1", firstName: "Mara", lastName: "S", status: "active" },
  forwardedTo: null,
  insider: null,
  via: null,
  targetCompany: { id: "c1", label: "Acme" },
  targetJobId: null,
  targetJobTitle: null,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe("ReferralWorkspaceClient", () => {
  it("renders the lifecycle rail + status display after loading", async () => {
    getReferral.mockResolvedValue({ success: true, data: detail() });
    render(<ReferralWorkspaceClient referralId="r1" />);
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getByTestId("referral-status-display")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /lifecycle/i })).toBeInTheDocument();
  });

  it("renders the not-found state", async () => {
    getReferral.mockResolvedValue({ success: false, message: "crm.errors.referralNotFound" });
    render(<ReferralWorkspaceClient referralId="missing" />);
    expect(await screen.findByText("insideTrack.workspace.notFound")).toBeInTheDocument();
  });

  it("performs a transition: calls the action, announces it, and moves focus to the status display", async () => {
    getReferral
      .mockResolvedValueOnce({ success: true, data: detail({ status: "open" }) })
      .mockResolvedValueOnce({ success: true, data: detail({ status: "engaged" }) });
    engageReferral.mockResolvedValue({ success: true });

    render(<ReferralWorkspaceClient referralId="r1" />);
    // forward action for open=insider_relay → engage
    const engageBtn = await screen.findByRole("button", {
      name: "insideTrack.action.engage.insider_relay",
    });
    await userEvent.click(engageBtn);

    await waitFor(() => expect(engageReferral).toHaveBeenCalledWith("r1"));
    // live region populated
    await waitFor(() =>
      expect(screen.getByTestId("referral-status-live")).toHaveTextContent(/statusLive/),
    );
    // focus moved to the always-present status display (action button unmounted)
    await waitFor(() =>
      expect(screen.getByTestId("referral-status-display")).toHaveFocus(),
    );
  });

  it("shows the converted banner + View Job link, and NO action bar, for a converted referral", async () => {
    getReferral.mockResolvedValue({
      success: true,
      data: detail({ status: "converted", targetJobId: "job-9" }),
    });
    render(<ReferralWorkspaceClient referralId="r1" />);
    expect(await screen.findByText("insideTrack.workspace.convertedBanner")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /viewJob/i });
    expect(link).toHaveAttribute("href", "/dashboard/myjobs/job-9");
    // no forward action group
    expect(screen.queryByRole("group", { name: /availableActions/i })).not.toBeInTheDocument();
  });

  it("shows the declined banner for a declined referral", async () => {
    getReferral.mockResolvedValue({ success: true, data: detail({ status: "declined" }) });
    render(<ReferralWorkspaceClient referralId="r1" />);
    expect(await screen.findByText("insideTrack.workspace.declinedBanner")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /availableActions/i })).not.toBeInTheDocument();
  });

  it("de-identifies an anonymized tipster", async () => {
    getReferral.mockResolvedValue({
      success: true,
      data: detail({ tipster: { id: "p1", firstName: "Mara", lastName: "S", status: "anonymized" } }),
    });
    render(<ReferralWorkspaceClient referralId="r1" />);
    await screen.findByText("Acme");
    expect(screen.getByText(/insideTrack\.workspace\.deidentified/)).toBeInTheDocument();
  });
});
