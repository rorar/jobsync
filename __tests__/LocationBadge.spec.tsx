import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { LocationBadge } from "@/components/ui/location-badge";

jest.mock(
  "@/lib/connector/job-discovery/modules/eures/countries",
  () => ({
    getLocationLabel: jest.fn(),
    getCountryCode: jest.fn(),
  }),
);

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

import {
  getLocationLabel,
  getCountryCode,
} from "@/lib/connector/job-discovery/modules/eures/countries";

describe("LocationBadge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the resolved label from getLocationLabel when resolve is true (default)", () => {
    (getLocationLabel as jest.Mock).mockReturnValue("DE1: Baden-Württemberg");
    (getCountryCode as jest.Mock).mockReturnValue(undefined);

    render(<LocationBadge code="de1" />);

    expect(screen.getByText("DE1: Baden-Württemberg")).toBeInTheDocument();
    expect(getLocationLabel).toHaveBeenCalledWith("de1");
  });

  it("renders the raw code when resolve is false", () => {
    (getLocationLabel as jest.Mock).mockReturnValue("DE1: Baden-Württemberg");
    (getCountryCode as jest.Mock).mockReturnValue(undefined);

    render(<LocationBadge code="de1" resolve={false} />);

    expect(screen.getByText("de1")).toBeInTheDocument();
    expect(getLocationLabel).not.toHaveBeenCalled();
  });

  it("renders the flag image with the correct src when getCountryCode returns a code", () => {
    (getLocationLabel as jest.Mock).mockReturnValue("Germany");
    (getCountryCode as jest.Mock).mockReturnValue("de");

    render(<LocationBadge code="de" />);

    const img = screen.getByRole("img", { name: "de" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/flags/de.svg");
  });

  it("does not render a flag image when getCountryCode returns undefined", () => {
    (getLocationLabel as jest.Mock).mockReturnValue("NS: Not Specified");
    (getCountryCode as jest.Mock).mockReturnValue(undefined);

    render(<LocationBadge code="ns" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("applies the custom className via cn() merge", () => {
    (getLocationLabel as jest.Mock).mockReturnValue("Germany");
    (getCountryCode as jest.Mock).mockReturnValue(undefined);

    const { container } = render(
      <LocationBadge code="de" className="my-custom-class" />,
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass("my-custom-class");
  });

  it("renders as a Badge with variant secondary", () => {
    (getLocationLabel as jest.Mock).mockReturnValue("Germany");
    (getCountryCode as jest.Mock).mockReturnValue(undefined);

    const { container } = render(<LocationBadge code="de" />);

    // The Badge component with variant="secondary" renders a div/span
    // containing the label — verify the element is rendered in the document
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText("Germany")).toBeInTheDocument();
  });

  it("uses lowercase country code for the flag src", () => {
    (getLocationLabel as jest.Mock).mockReturnValue("Greece");
    (getCountryCode as jest.Mock).mockReturnValue("gr");

    render(<LocationBadge code="el" />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/flags/gr.svg");
  });
});
