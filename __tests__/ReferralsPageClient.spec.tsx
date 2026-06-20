/**
 * ReferralsPageClient — Inside Track home (Welle 5, Task 5.2).
 * Lists referrals (listReferrals), filter by status/kind, row → workspace,
 * New Tip → TipCaptureSheet. TipsterShownLive de-identification in the list.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

jest.mock("@/i18n", () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: "en" }),
  formatDateShort: () => "Jun 1, 2026",
}));

const mockList = jest.fn();
jest.mock("@/actions/referral.actions", () => ({
  listReferrals: (...args: unknown[]) => mockList(...args),
}));

// Stub the sheet (it self-fetches persons/companies on open otherwise).
jest.mock("@/components/inside-track/TipCaptureSheet", () => ({
  TipCaptureSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="tip-sheet-open" /> : null,
}));

// Any lucide icon → a stub svg.
jest.mock("lucide-react", () =>
  new Proxy(
    {},
    { get: () => (props: React.SVGProps<SVGSVGElement>) => <svg {...props} /> },
  ),
);

import ReferralsPageClient from "@/app/dashboard/referrals/ReferralsPageClient";

const entry = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  kind: "insider_relay",
  status: "open",
  receivedAt: new Date("2026-06-01"),
  lastActivityAt: new Date("2026-06-01"),
  tipster: { id: "p1", firstName: "Mara", lastName: "S", status: "active" },
  targetCompany: { id: "c1", label: "Acme" },
  targetJobId: null,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe("ReferralsPageClient", () => {
  it("loads then renders the populated table", async () => {
    mockList.mockResolvedValue({ success: true, data: [entry()] });
    render(<ReferralsPageClient />);
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Mara S")).toBeInTheDocument();
  });

  it("renders the empty state when there are no referrals", async () => {
    mockList.mockResolvedValue({ success: true, data: [] });
    render(<ReferralsPageClient />);
    expect(await screen.findByText("insideTrack.list.empty.title")).toBeInTheDocument();
  });

  it("renders an error + retry when the load fails", async () => {
    mockList.mockResolvedValue({ success: false, message: "insideTrack.list.loadError" });
    render(<ReferralsPageClient />);
    expect(await screen.findByText("insideTrack.list.loadError")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "insideTrack.list.retry" }),
    ).toBeInTheDocument();
  });

  it("navigates to the workspace on row click", async () => {
    mockList.mockResolvedValue({ success: true, data: [entry()] });
    render(<ReferralsPageClient />);
    await userEvent.click(await screen.findByText("Acme"));
    expect(push).toHaveBeenCalledWith("/dashboard/referrals/r1");
  });

  it("opens TipCapture when New Tip is clicked", async () => {
    mockList.mockResolvedValue({ success: true, data: [entry()] });
    render(<ReferralsPageClient />);
    await screen.findByText("Acme");
    await userEvent.click(screen.getByRole("button", { name: /insideTrack\.newTip/ }));
    expect(screen.getByTestId("tip-sheet-open")).toBeInTheDocument();
  });

  it("de-identifies an anonymized tipster (TipsterShownLive)", async () => {
    mockList.mockResolvedValue({
      success: true,
      data: [
        entry({
          tipster: { id: "p1", firstName: "Mara", lastName: "S", status: "anonymized" },
        }),
      ],
    });
    render(<ReferralsPageClient />);
    expect(
      await screen.findByText("insideTrack.workspace.deidentified"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Mara S")).not.toBeInTheDocument();
  });

  it("shows the em-dash for a referral with no target company", async () => {
    mockList.mockResolvedValue({
      success: true,
      data: [entry({ targetCompany: null })],
    });
    render(<ReferralsPageClient />);
    expect(await screen.findByText("insideTrack.list.noCompany")).toBeInTheDocument();
  });
});
