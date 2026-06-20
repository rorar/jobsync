/**
 * ReferralStatusBadge + ReferralKindBadge — Welle 5 (Inside Track) Phase 5.
 * Shared display badges. SoT: specs/inside-track.allium `status` + `kind`.
 * WCAG 1.4.1: every badge carries a text label (colour is never the sole signal).
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "insideTrack.status.open": "Open",
        "insideTrack.status.engaged": "Engaged",
        "insideTrack.status.converted": "Converted",
        "insideTrack.status.declined": "Declined",
        "insideTrack.status.stale": "Stale",
        "insideTrack.kind.insider_relay": "Insider relay",
        "insideTrack.kind.network_path": "Network path",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

import { ReferralStatusBadge } from "@/components/inside-track/ReferralStatusBadge";
import { ReferralKindBadge } from "@/components/inside-track/ReferralKindBadge";

describe("ReferralStatusBadge", () => {
  it("renders the localized status label (text, not colour alone)", () => {
    render(<ReferralStatusBadge status="converted" />);
    expect(screen.getByText("Converted")).toBeInTheDocument();
  });

  it("tags the element with data-status for styling/testing", () => {
    render(<ReferralStatusBadge status="declined" />);
    expect(screen.getByText("Declined")).toHaveAttribute("data-status", "declined");
  });

  it("renders multiple distinct statuses", () => {
    const { container } = render(
      <>
        <ReferralStatusBadge status="open" />
        <ReferralStatusBadge status="converted" />
        <ReferralStatusBadge status="stale" />
      </>,
    );
    expect(container.querySelectorAll("[data-status]")).toHaveLength(3);
  });
});

describe("ReferralKindBadge", () => {
  it("renders the insider_relay label", () => {
    render(<ReferralKindBadge kind="insider_relay" />);
    expect(screen.getByText("Insider relay")).toBeInTheDocument();
  });

  it("renders the network_path label", () => {
    render(<ReferralKindBadge kind="network_path" />);
    expect(screen.getByText("Network path")).toBeInTheDocument();
  });
});
