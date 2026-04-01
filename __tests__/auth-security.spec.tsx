/**
 * Security tests for authentication forms.
 * Verifies defense-in-depth against credential leakage via URL.
 *
 * CVE: Credentials exposed in URL when forms fall back to native GET
 * during Next.js hydration gaps.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

// Mock server actions
jest.mock("@/actions/auth.actions", () => ({
  authenticate: jest.fn().mockResolvedValue(null),
  signup: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock react-hook-form minimally to render the actual form elements
jest.mock("@hookform/resolvers/zod", () => ({
  zodResolver: () => jest.fn(),
}));

import SigninForm from "@/components/auth/SigninForm";
import SignupForm from "@/components/auth/SignupForm";

describe("Auth Form Security", () => {
  const originalLocation = window.location;
  const mockReplaceState = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    document.documentElement.lang = "en";

    // Mock history.replaceState for URL sanitization tests
    Object.defineProperty(window, "history", {
      value: { ...window.history, replaceState: mockReplaceState },
      writable: true,
    });
  });

  afterEach(() => {
    document.documentElement.lang = "";
  });

  describe("SigninForm", () => {
    it("renders form with method=POST to prevent GET fallback", () => {
      render(<SigninForm />);
      const form = document.querySelector("form");
      expect(form).toHaveAttribute("method", "POST");
    });

    it("renders form with action attribute for defense-in-depth", () => {
      render(<SigninForm />);
      const form = document.querySelector("form");
      expect(form).toHaveAttribute("action");
    });

    it("does NOT use method=GET", () => {
      render(<SigninForm />);
      const form = document.querySelector("form");
      expect(form?.getAttribute("method")?.toUpperCase()).not.toBe("GET");
    });

    it("password input has type=password", () => {
      render(<SigninForm />);
      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("password input has autocomplete=current-password", () => {
      render(<SigninForm />);
      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute("autocomplete", "current-password");
    });
  });

  describe("SignupForm", () => {
    it("renders form with method=POST to prevent GET fallback", () => {
      render(<SignupForm />);
      const form = document.querySelector("form");
      expect(form).toHaveAttribute("method", "POST");
    });

    it("renders form with action attribute for defense-in-depth", () => {
      render(<SignupForm />);
      const form = document.querySelector("form");
      expect(form).toHaveAttribute("action");
    });

    it("does NOT use method=GET", () => {
      render(<SignupForm />);
      const form = document.querySelector("form");
      expect(form?.getAttribute("method")?.toUpperCase()).not.toBe("GET");
    });

    it("password input has type=password", () => {
      render(<SignupForm />);
      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute("type", "password");
    });
  });

  describe("URL Credential Sanitization", () => {
    it("strips email and password params from URL on mount (SigninForm)", () => {
      // Simulate URL with leaked credentials
      Object.defineProperty(window, "location", {
        value: new URL("http://localhost:3737/signin?email=test@example.com&password=secret"),
        writable: true,
      });

      render(<SigninForm />);

      expect(mockReplaceState).toHaveBeenCalledWith(
        {},
        "",
        "/signin"
      );

      // Restore
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });

    it("strips email, password, and name params from URL on mount (SignupForm)", () => {
      Object.defineProperty(window, "location", {
        value: new URL("http://localhost:3737/signup?name=Test&email=test@example.com&password=secret"),
        writable: true,
      });

      render(<SignupForm />);

      expect(mockReplaceState).toHaveBeenCalledWith(
        {},
        "",
        "/signup"
      );

      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });

    it("does NOT modify URL when no credential params present", () => {
      Object.defineProperty(window, "location", {
        value: new URL("http://localhost:3737/signin"),
        writable: true,
      });

      render(<SigninForm />);

      expect(mockReplaceState).not.toHaveBeenCalled();

      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });
  });
});

describe("Middleware Security Headers", () => {
  // These are integration-level concerns tested via the middleware function.
  // We verify the middleware configuration includes auth routes in the matcher.

  it("middleware matcher includes /signin and /signup routes", async () => {
    // We can't easily run Next.js middleware in Jest, but we can verify
    // the config export matches our security requirements.
    const { config } = await import("@/middleware");
    expect(config.matcher).toContain("/signin");
    expect(config.matcher).toContain("/signup");
  });
});
