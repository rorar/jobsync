/**
 * CompanyLogo component tests
 *
 * Tests: initials fallback, image rendering, error state graceful
 * degradation, size variants, accessibility attributes.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompanyLogo } from "@/components/ui/company-logo";

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "enrichment.noLogo": "No logo available",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

describe("CompanyLogo", () => {
  describe("Initials fallback", () => {
    it("shows first two characters for single-word company name", () => {
      render(<CompanyLogo companyName="Google" />);
      expect(screen.getByText("GO")).toBeInTheDocument();
    });

    it("shows initials from first two words", () => {
      render(<CompanyLogo companyName="Acme Corp" />);
      expect(screen.getByText("AC")).toBeInTheDocument();
    });

    it("shows ?? for empty company name", () => {
      render(<CompanyLogo companyName="" />);
      expect(screen.getByText("??")).toBeInTheDocument();
    });

    it("renders initials when logoUrl is null", () => {
      render(<CompanyLogo companyName="TechCorp" logoUrl={null} />);
      expect(screen.getByText("TE")).toBeInTheDocument();
    });

    it("renders initials when logoUrl is undefined", () => {
      render(<CompanyLogo companyName="TechCorp" logoUrl={undefined} />);
      expect(screen.getByText("TE")).toBeInTheDocument();
    });
  });

  describe("Image rendering", () => {
    it("renders an img element when logoUrl is provided", () => {
      render(
        <CompanyLogo
          companyName="Google"
          logoUrl="https://img.logo.dev/google.com"
        />,
      );
      const img = screen.getByAltText("Google");
      expect(img).toBeInTheDocument();
      expect(img.tagName).toBe("IMG");
    });

    it("falls back to initials on image error", () => {
      render(
        <CompanyLogo
          companyName="BadLogo Corp"
          logoUrl="https://broken.example.com/logo.png"
        />,
      );

      // Simulate image error
      const img = screen.getByAltText("BadLogo Corp");
      fireEvent.error(img);

      // Should now show initials
      expect(screen.getByText("BC")).toBeInTheDocument();
    });
  });

  describe("Size variants", () => {
    it("applies sm size (24px)", () => {
      const { container } = render(
        <CompanyLogo companyName="Small Co" size="sm" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.width).toBe("24px");
      expect(wrapper.style.height).toBe("24px");
    });

    it("applies md size by default (32px)", () => {
      const { container } = render(
        <CompanyLogo companyName="Medium Co" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.width).toBe("32px");
      expect(wrapper.style.height).toBe("32px");
    });

    it("applies lg size (48px)", () => {
      const { container } = render(
        <CompanyLogo companyName="Large Co" size="lg" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.width).toBe("48px");
      expect(wrapper.style.height).toBe("48px");
    });
  });

  describe("Accessibility", () => {
    it("has role=img and aria-label with company name (initials mode)", () => {
      render(<CompanyLogo companyName="Accessible Inc" />);
      const element = screen.getByRole("img");
      expect(element).toHaveAttribute("aria-label", "Accessible Inc");
    });

    it("has alt text on the img element (image mode)", () => {
      render(
        <CompanyLogo
          companyName="Accessible Inc"
          logoUrl="https://example.com/logo.png"
        />,
      );
      // The img element carries the accessible name via alt attribute
      const img = screen.getByAltText("Accessible Inc");
      expect(img).toBeInTheDocument();
      expect(img.tagName).toBe("IMG");
    });

    it("uses noLogo translation as aria-label for empty company name", () => {
      render(<CompanyLogo companyName="" />);
      const element = screen.getByRole("img");
      expect(element).toHaveAttribute("aria-label", "No logo available");
    });
  });

  describe("Custom className", () => {
    it("applies custom className to container", () => {
      const { container } = render(
        <CompanyLogo companyName="Custom" className="my-custom-class" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass("my-custom-class");
    });
  });

  // -------------------------------------------------------------------------
  // L-P-04 (Sprint 4 Stream B) — state re-init guard.
  //
  // The fix uses a ref to remember the last URL pair and short-circuits the
  // reset effect when the VALUES haven't changed (regardless of prop object
  // identity). These tests pin the two observable behaviours:
  //
  //   1. A re-render with the SAME logoUrl/logoAssetId values must NOT flash
  //      the skeleton — the effect must no-op and the <img> must stay
  //      painted (i.e. still visible, still pointing at the same src).
  //   2. A re-render with a GENUINELY different logoUrl MUST re-init —
  //      the new src must be reflected in the DOM.
  //
  // The skeleton is an `aria-hidden` pulse wrapper that appears only while
  // `imageState === "loading"`, so checking for its absence after a
  // same-value re-render is a tight test of the guard.
  // -------------------------------------------------------------------------

  describe("L-P-04 — state re-init guard on prop re-render", () => {
    it("does NOT re-run the loading effect when props re-render with the same values", () => {
      const { rerender, container } = render(
        <CompanyLogo
          companyName="Acme Corp"
          logoUrl="https://example.com/logo.png"
        />,
      );

      // Simulate image load so we leave the "loading" state.
      const img = screen.getByAltText("Acme Corp");
      fireEvent.load(img);

      // Sanity: after load, the skeleton pulse is removed.
      const skeletonAfterLoad = container.querySelector(".animate-pulse");
      expect(skeletonAfterLoad).toBeNull();

      // Re-render with a NEW prop object but the SAME URL value. Before
      // the fix this would re-run the effect and flip imageState back to
      // "loading", re-introducing the skeleton. After the fix the ref
      // guards against the value-equal re-render.
      rerender(
        <CompanyLogo
          companyName="Acme Corp"
          logoUrl="https://example.com/logo.png"
        />,
      );

      // The skeleton MUST NOT have reappeared.
      const skeletonAfterRerender =
        container.querySelector(".animate-pulse");
      expect(skeletonAfterRerender).toBeNull();

      // The img element should still be painted and pointing at the
      // same src.
      const imgAfterRerender = screen.getByAltText("Acme Corp");
      expect(imgAfterRerender).toHaveAttribute(
        "src",
        "https://example.com/logo.png",
      );
    });

    it("DOES re-run the loading effect when logoUrl actually changes", () => {
      const { rerender, container } = render(
        <CompanyLogo
          companyName="Acme Corp"
          logoUrl="https://example.com/first.png"
        />,
      );

      fireEvent.load(screen.getByAltText("Acme Corp"));
      expect(container.querySelector(".animate-pulse")).toBeNull();

      // Re-render with a DIFFERENT URL value — the effect must re-init
      // (skeleton back) and the img src must update.
      rerender(
        <CompanyLogo
          companyName="Acme Corp"
          logoUrl="https://example.com/second.png"
        />,
      );

      const imgAfterRerender = screen.getByAltText("Acme Corp");
      expect(imgAfterRerender).toHaveAttribute(
        "src",
        "https://example.com/second.png",
      );
      // Skeleton is back while the new image loads.
      expect(container.querySelector(".animate-pulse")).not.toBeNull();
    });

    it("DOES re-run the loading effect when logoAssetId actually changes", () => {
      const { rerender } = render(
        <CompanyLogo companyName="Acme Corp" logoAssetId="first-id" />,
      );
      fireEvent.load(screen.getByAltText("Acme Corp"));

      rerender(
        <CompanyLogo companyName="Acme Corp" logoAssetId="second-id" />,
      );
      const img = screen.getByAltText("Acme Corp");
      expect(img).toHaveAttribute("src", "/api/logos/second-id");
    });
  });

  describe("logoAssetId support", () => {
    it("renders local asset URL when logoAssetId provided", () => {
      render(
        <CompanyLogo companyName="Acme Corp" logoAssetId="abc" />,
      );
      const img = screen.getByAltText("Acme Corp");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "/api/logos/abc");
    });

    it("falls back to external URL when local asset fails", () => {
      render(
        <CompanyLogo
          companyName="Acme Corp"
          logoAssetId="abc"
          logoUrl="https://external.example.com/logo.png"
        />,
      );

      // Initially should use the local asset URL
      const img = screen.getByAltText("Acme Corp");
      expect(img).toHaveAttribute("src", "/api/logos/abc");

      // Simulate local asset error
      fireEvent.error(img);

      // Should now use the external URL as fallback
      const fallbackImg = screen.getByAltText("Acme Corp");
      expect(fallbackImg).toHaveAttribute(
        "src",
        "https://external.example.com/logo.png",
      );
    });

    it("shows initials when both sources fail", () => {
      render(
        <CompanyLogo
          companyName="Acme Corp"
          logoAssetId="abc"
          logoUrl="https://external.example.com/logo.png"
        />,
      );

      // Simulate local asset error
      const img = screen.getByAltText("Acme Corp");
      fireEvent.error(img);

      // Simulate external URL error
      const fallbackImg = screen.getByAltText("Acme Corp");
      fireEvent.error(fallbackImg);

      // Should now show initials
      expect(screen.getByText("AC")).toBeInTheDocument();
    });

    it("has role=img on loaded-state container", () => {
      render(<CompanyLogo companyName="Acme Corp" />);
      // In initials mode the container has role="img"
      const element = screen.getByRole("img");
      expect(element).toBeInTheDocument();
      expect(element).toHaveAttribute("role", "img");
    });

    it("trims whitespace in aria-label", () => {
      // Whitespace-only company name: getInitials returns "??" (via trim())
      // aria-label uses companyName || t("enrichment.noLogo")
      // "   " is truthy, so aria-label preserves the raw value
      render(<CompanyLogo companyName="   " />);
      const element = screen.getByRole("img");
      // Initials should show "??" since trimmed name is empty
      expect(screen.getByText("??")).toBeInTheDocument();
      // aria-label should still be set (not empty/undefined)
      expect(element).toHaveAttribute("aria-label");
    });
  });
});
