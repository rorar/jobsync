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
});
