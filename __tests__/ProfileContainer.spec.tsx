import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProfileContainer from "@/components/profile/ProfileContainer";
import React from "react";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  })),
  redirect: jest.fn(),
}));

jest.mock("@/actions/profile.actions", () => ({
  getResumeList: jest.fn(() =>
    Promise.resolve({
      data: [],
      total: 0,
      success: true,
      message: "",
    }),
  ),
}));

// ProfilePreferencesCard has its own test (ProfilePreferencesCard.spec.tsx) and
// calls reference-data server actions on mount — stub it here so this test stays
// focused on the résumé-management behavior of ProfileContainer.
jest.mock("@/components/profile/ProfilePreferencesCard", () => ({
  __esModule: true,
  default: () => null,
}));

describe("ProfileContainer Component", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await act(async () => {
      render(<ProfileContainer />);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  it("should render the profile container component", () => {
    expect(screen.getByText(/profile/i)).toBeInTheDocument();
  });

  it("should open the create resume dialog upon clicking create resume button", async () => {
    const createResumeButton = screen.getByRole("button", {
      name: /new resume/i,
    });
    await act(async () => {
      fireEvent.click(createResumeButton);
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /create resume/i }),
    ).toBeInTheDocument();
  });
});
