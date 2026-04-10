/**
 * MatchScoreRing component tests
 *
 * Covers the shared ring extracted from DeckCard / StagedVacancyDetailContent.
 * Asserts: rendering with valid scores (low/mid/high/edge values), null/undefined
 * fallbacks, the optional `size` prop, and accessibility role/label.
 *
 * Sprint 2 Stream G (H-Y-01 / H-Y-02) regression guard:
 *   - Default (no ariaLabel / no ariaHidden) must be DECORATIVE
 *     (role="presentation" + aria-hidden="true") — NOT a hardcoded English
 *     label. Callers MUST explicitly pass ariaLabel or ariaHidden.
 *   - ariaLabel → role="img" + the translated string as accessible name.
 *   - ariaHidden={true} → decorative regardless of any other props.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MatchScoreRing } from "@/components/staging/MatchScoreRing";

function findSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("No SVG rendered by MatchScoreRing");
  return svg as unknown as SVGSVGElement;
}

describe("MatchScoreRing — content rendering", () => {
  it("renders the score number inside the SVG", () => {
    const { container } = render(
      <MatchScoreRing score={85} ariaLabel="Match score 85 of 100" />,
    );
    const ring = screen.getByRole("img", { name: /match score 85 of 100/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("85");
    expect(findSvg(container).textContent).toBe("85");
  });

  it("renders an em-dash placeholder when score is null", () => {
    const { container } = render(
      <MatchScoreRing
        score={null}
        ariaLabel="Match score not available"
      />,
    );
    const ring = screen.getByRole("img", { name: /not available/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("—");
    expect(findSvg(container).textContent).toBe("—");
  });

  it("renders an em-dash placeholder when score is undefined", () => {
    render(
      <MatchScoreRing
        score={undefined}
        ariaLabel="Match score not available"
      />,
    );
    const ring = screen.getByRole("img", { name: /not available/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("—");
  });

  it("renders a zero score (boundary) with the red color stroke", () => {
    const { container } = render(
      <MatchScoreRing score={0} ariaLabel="Match score 0 of 100" />,
    );
    const ring = screen.getByRole("img", { name: /match score 0 of 100/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("0");
    // The progress circle for the red threshold (< 40)
    const progressCircle = findSvg(container).querySelector(
      "circle.stroke-red-500",
    );
    expect(progressCircle).toBeInTheDocument();
  });

  it("renders a perfect 100 score with the emerald color stroke", () => {
    const { container } = render(
      <MatchScoreRing score={100} ariaLabel="Match score 100 of 100" />,
    );
    const ring = screen.getByRole("img", { name: /match score 100 of 100/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("100");
    // L-Y-05 (Sprint 4 Stream E) — the high-score stroke is bumped
    // from emerald-500 (2.61:1 on white — FAIL) to emerald-600 (3.39:1
    // on white — PASS) to satisfy WCAG 1.4.11 Non-text Contrast.
    const progressCircle = findSvg(container).querySelector(
      "circle.stroke-emerald-600",
    );
    expect(progressCircle).toBeInTheDocument();
  });

  it("respects the optional size prop", () => {
    render(
      <MatchScoreRing
        score={50}
        size={64}
        ariaLabel="Match score 50 of 100"
      />,
    );
    const ring = screen.getByRole("img", { name: /match score 50 of 100/i });
    expect(ring).toHaveAttribute("width", "64");
    expect(ring).toHaveAttribute("height", "64");
  });

  it("defaults to a 44px size when no size prop is provided", () => {
    render(
      <MatchScoreRing score={75} ariaLabel="Match score 75 of 100" />,
    );
    const ring = screen.getByRole("img", { name: /match score 75 of 100/i });
    expect(ring).toHaveAttribute("width", "44");
    expect(ring).toHaveAttribute("height", "44");
  });

  it("clamps scores above 100 to the displayed maximum", () => {
    render(
      <MatchScoreRing score={150} ariaLabel="Match score 100 of 100" />,
    );
    const ring = screen.getByRole("img", { name: /match score 100 of 100/i });
    expect(ring.textContent).toBe("100");
  });
});

describe("MatchScoreRing — edge case scores (L-T-05)", () => {
  // These tests pin the actual production behaviour of MatchScoreRing for
  // numeric edge cases. The component uses `Number.isFinite(score)` as its
  // validity guard, so NaN and Infinity both fall into the "no score" path
  // and render the em-dash placeholder. Negative scores pass the isFinite
  // guard but are clamped to 0 by `Math.max(0, ...)`.

  it("negative score is clamped to 0 and renders '0'", () => {
    // hasScore=true (Number.isFinite(-5) === true), clamped = Math.max(0, -5) = 0
    const { container } = render(
      <MatchScoreRing score={-5} ariaLabel="Match score 0 of 100" />,
    );
    const ring = screen.getByRole("img", { name: /match score 0 of 100/i });
    expect(ring).toBeInTheDocument();
    // Displays the clamped value, not the raw negative number.
    expect(ring.textContent).toBe("0");
    // The progress ring for the red threshold must be present (clamped → 0 < 40).
    const progressCircle = findSvg(container).querySelector(
      "circle.stroke-red-500",
    );
    expect(progressCircle).toBeInTheDocument();
  });

  it("NaN score renders the em-dash placeholder (non-finite → no score path)", () => {
    // Number.isFinite(NaN) === false → hasScore=false → em-dash
    render(
      <MatchScoreRing score={NaN} ariaLabel="Match score not available" />,
    );
    const ring = screen.getByRole("img", { name: /not available/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("—");
  });

  it("Infinity score renders the em-dash placeholder (non-finite → no score path)", () => {
    // Number.isFinite(Infinity) === false → hasScore=false → em-dash
    render(
      <MatchScoreRing score={Infinity} ariaLabel="Match score not available" />,
    );
    const ring = screen.getByRole("img", { name: /not available/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("—");
  });

  it("-Infinity score renders the em-dash placeholder (non-finite → no score path)", () => {
    render(
      <MatchScoreRing score={-Infinity} ariaLabel="Match score not available" />,
    );
    const ring = screen.getByRole("img", { name: /not available/i });
    expect(ring).toBeInTheDocument();
    expect(ring.textContent).toBe("—");
  });
});

describe("MatchScoreRing — accessibility contract (H-Y-01 / H-Y-02)", () => {
  it("is DECORATIVE (presentation + aria-hidden) when no ariaLabel is passed", () => {
    // Default mode guards against the old hardcoded English label. DeckCard
    // relies on this fallback — a visually hidden sibling span already
    // announces the translated score, so the SVG must be hidden from AT.
    const { container } = render(<MatchScoreRing score={85} />);
    const svg = findSvg(container);
    expect(svg.getAttribute("role")).toBe("presentation");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    // And the old hardcoded English label is GONE.
    expect(svg.getAttribute("aria-label")).toBeNull();
  });

  it("exposes role='img' + the translated label when ariaLabel is provided", () => {
    render(
      <MatchScoreRing score={72} ariaLabel="Match-Score 72 von 100" />,
    );
    // German label proves the label is passed through unchanged.
    const ring = screen.getByRole("img", { name: "Match-Score 72 von 100" });
    expect(ring).toBeInTheDocument();
  });

  it("is decorative when ariaHidden is true even if ariaLabel is also set", () => {
    // DeckCard-style usage: the sibling sr-only span owns the announcement;
    // the SVG must not be re-announced even if a label is accidentally passed.
    const { container } = render(
      <MatchScoreRing
        score={50}
        ariaLabel="Should be ignored"
        ariaHidden
      />,
    );
    const svg = findSvg(container);
    expect(svg.getAttribute("role")).toBe("presentation");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("aria-label")).toBeNull();
  });

  it("does NOT hardcode any English label in the SVG DOM", () => {
    // Direct regression guard against H-Y-01: the old aria-label="Match
    // score: {score}" MUST NOT reappear in any render path.
    const { container: c1 } = render(<MatchScoreRing score={50} />);
    const { container: c2 } = render(<MatchScoreRing score={null} />);
    const { container: c3 } = render(
      <MatchScoreRing score={50} ariaHidden />,
    );
    for (const c of [c1, c2, c3]) {
      const label = findSvg(c).getAttribute("aria-label");
      expect(label).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Sprint 4 Stream E — L-Y-05: WCAG 1.4.11 Non-text contrast audit
//
// The stroke on the progress arc sits on top of the card's white
// background (+ the muted track ring). WCAG 1.4.11 requires ≥ 3:1
// contrast between the graphical object and its adjacent background.
// This block locks in the post-audit color choices for each threshold
// bucket so a future "let's lighten this a bit" refactor can't
// silently regress the contrast ratio.
// ---------------------------------------------------------------------------

describe("MatchScoreRing — L-Y-05 contrast audit (WCAG 1.4.11)", () => {
  it("high-score (>=80) uses stroke-emerald-600 (3.39:1 on white)", () => {
    const { container } = render(
      <MatchScoreRing score={90} ariaHidden />,
    );
    // Must be the bumped amber-700 equivalent; MUST NOT be emerald-500
    // (the old failing value, 2.61:1).
    expect(
      findSvg(container).querySelector("circle.stroke-emerald-600"),
    ).toBeInTheDocument();
    expect(
      findSvg(container).querySelector("circle.stroke-emerald-500"),
    ).toBeNull();
  });

  it("mid-score (60-79) uses stroke-blue-500 (3.68:1 on white)", () => {
    const { container } = render(
      <MatchScoreRing score={70} ariaHidden />,
    );
    expect(
      findSvg(container).querySelector("circle.stroke-blue-500"),
    ).toBeInTheDocument();
  });

  it("mid-score (40-59) uses stroke-amber-700 (4.52:1 on white)", () => {
    const { container } = render(
      <MatchScoreRing score={50} ariaHidden />,
    );
    // Must be the bumped amber-700; MUST NOT be amber-500 (1.96:1 FAIL)
    // or amber-600 (2.85:1 FAIL marginal).
    expect(
      findSvg(container).querySelector("circle.stroke-amber-700"),
    ).toBeInTheDocument();
    expect(
      findSvg(container).querySelector("circle.stroke-amber-500"),
    ).toBeNull();
    expect(
      findSvg(container).querySelector("circle.stroke-amber-600"),
    ).toBeNull();
  });

  it("low-score (<40) uses stroke-red-500 (3.76:1 on white)", () => {
    const { container } = render(
      <MatchScoreRing score={20} ariaHidden />,
    );
    expect(
      findSvg(container).querySelector("circle.stroke-red-500"),
    ).toBeInTheDocument();
  });
});
