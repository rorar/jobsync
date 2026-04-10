/**
 * Root global-error boundary — Sprint 3 Stream G regression guard.
 *
 * This mirrors the Sprint 2 Stream H fix for `src/app/dashboard/error.tsx`
 * (commit c85af40 — H-NEW-03) applied to the Next.js ROOT error
 * boundary. Before the fix `global-error.tsx` had:
 *
 *   1. Three hardcoded English strings ("Something went wrong", error
 *      message, "Try again") — no i18n.
 *   2. No `role="alert"` + `aria-live="assertive"` — screen readers
 *      were not notified when Next.js swapped in the error tree.
 *   3. No programmatic focus management — keyboard users were
 *      stranded on a detached previous-focus target.
 *   4. Rendered `error.message` verbatim, leaking stack fragments and
 *      potentially user-identifying information.
 *
 * After the fix the error boundary matches the dashboard error
 * boundary contract. NOTE: we deliberately DO NOT render the real
 * `<html>` + `<body>` because jsdom's document already owns those
 * elements. The test renders the inner content via the
 * `container.firstChild` escape hatch below.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the translation hook. The hook fallbacks to
// `document.documentElement.lang` so we don't need to set a locale —
// but we DO need stable English strings for the assertions below.
jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "errors.somethingWentWrong": "Something went wrong",
        "errors.genericDescription":
          "We hit an unexpected problem loading this page. Please try again or return to the dashboard.",
        "errors.tryAgain": "Try again",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

/**
 * `global-error.tsx` renders its own `<html>` + `<body>` wrappers
 * because Next.js runs it as a root boundary. Mounting those tags
 * inside an existing jsdom document is noisy (React warns about
 * `<html>` not being a valid child of `<div>`) but functionally
 * correct: React still builds the DOM subtree, and
 * `testing-library/react`'s `baseElement` queries can find the
 * inner alert region by scoping to `document.body`.
 *
 * We suppress the React hierarchy warnings with a `console.error`
 * spy (restored after each test) so the test output stays clean.
 * The test suite's OTHER console.error assertion (the operator-log
 * guard) is made via a separate, dedicated spy in its own test so
 * the two concerns don't collide.
 */
import GlobalError from "@/app/global-error";

function renderGlobalError(errorOverrides: Partial<Error> = {}) {
  const error = Object.assign(
    new Error("Raw Prisma: PrismaClientKnownRequestError @ user.findFirst"),
    errorOverrides,
  );
  const reset = jest.fn();

  const utils = render(<GlobalError error={error} reset={reset} />);

  return { ...utils, reset, error };
}

describe("GlobalError — Sprint 3 Stream G root boundary fix", () => {
  // Suppress React's `<html>` + `<body>` hierarchy warnings. The
  // boundary legitimately renders these tags because Next.js mounts
  // it as a root replacement. We still assert on operator logging in
  // a separate, dedicated test (below) using its own spy.
  let consoleSpy: jest.SpyInstance;
  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("wraps content in a role=alert + aria-live=assertive + aria-atomic region", () => {
    renderGlobalError();

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveAttribute("aria-atomic", "true");
  });

  it("renders all three translated strings via the i18n adapter", () => {
    renderGlobalError();

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(
        "We hit an unexpected problem loading this page. Please try again or return to the dashboard.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("does NOT render the raw error.message in the DOM (stack leak guard)", () => {
    renderGlobalError();

    // The raw message contains internal Prisma details. It MUST NOT
    // appear anywhere in the rendered tree.
    expect(
      screen.queryByText(/PrismaClientKnownRequestError/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/user\.findFirst/)).not.toBeInTheDocument();
  });

  it("logs the original error to console for operators", () => {
    renderGlobalError();

    // The error IS logged to the console with a stable prefix so
    // operators can still debug the failure via Next.js server logs.
    // `console.error` was spied above; we assert the operator log
    // was emitted alongside any incidental React warnings.
    const operatorLog = consoleSpy.mock.calls.find(
      (call) => call[0] === "[GlobalError]",
    );
    expect(operatorLog).toBeDefined();
    expect(operatorLog?.[1]).toBeInstanceOf(Error);
  });

  it("moves focus to the heading on mount (WCAG 2.4.3)", () => {
    renderGlobalError();

    const heading = screen.getByRole("heading", {
      name: "Something went wrong",
    });

    // tabIndex=-1 makes the <h1> programmatically focusable without
    // adding it to the Tab sequence.
    expect(heading).toHaveAttribute("tabIndex", "-1");

    // The effect moves focus to the heading after mount. jsdom's
    // focus model honors the effect call directly.
    expect(document.activeElement).toBe(heading);
  });

  it("calls reset() when the Try again button is clicked", () => {
    const { reset } = renderGlobalError();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
