/**
 * MatchScoreRing component tests
 *
 * Covers the shared ring extracted from DeckCard / StagedVacancyDetailContent.
 * Asserts: rendering with valid scores (low/mid/high/edge values), null/undefined
 * fallbacks, the optional `size` prop, and accessibility role/label.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MatchScoreRing } from "@/components/staging/MatchScoreRing";

describe("MatchScoreRing", () => {
  it("renders the score number inside the SVG", () => {
    render(<MatchScoreRing score={85} />);
    const ring = screen.getByRole("img", { name: /match score 85 of 100/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("85");
  });

  it("renders an em-dash placeholder when score is null", () => {
    render(<MatchScoreRing score={null} />);
    const ring = screen.getByRole("img", { name: /not available/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("—");
  });

  it("renders an em-dash placeholder when score is undefined", () => {
    render(<MatchScoreRing score={undefined} />);
    const ring = screen.getByRole("img", { name: /not available/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("—");
  });

  it("renders a zero score (boundary) with the red color stroke", () => {
    render(<MatchScoreRing score={0} />);
    const ring = screen.getByRole("img", { name: /match score 0 of 100/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("0");
    // The progress circle for the red threshold (< 40)
    const progressCircle = ring.querySelector("circle.stroke-red-500");
    expect(progressCircle).toBeInTheDocument();
  });

  it("renders a perfect 100 score with the emerald color stroke", () => {
    render(<MatchScoreRing score={100} />);
    const ring = screen.getByRole("img", { name: /match score 100 of 100/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("100");
    const progressCircle = ring.querySelector("circle.stroke-emerald-500");
    expect(progressCircle).toBeInTheDocument();
  });

  it("respects the optional size prop", () => {
    render(<MatchScoreRing score={50} size={64} />);
    const ring = screen.getByRole("img", { name: /match score 50 of 100/i });
    expect(ring).toHaveAttribute("width", "64");
    expect(ring).toHaveAttribute("height", "64");
  });

  it("defaults to a 44px size when no size prop is provided", () => {
    render(<MatchScoreRing score={75} />);
    const ring = screen.getByRole("img", { name: /match score 75 of 100/i });
    expect(ring).toHaveAttribute("width", "44");
    expect(ring).toHaveAttribute("height", "44");
  });

  it("clamps scores above 100 to the displayed maximum", () => {
    render(<MatchScoreRing score={150} />);
    // The aria-label uses the clamped value, not the raw input
    const ring = screen.getByRole("img", { name: /match score 100 of 100/i });
    expect(ring.textContent).toBe("100");
  });
});
