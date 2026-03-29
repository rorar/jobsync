import React from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AutomationSettings from "@/components/settings/AutomationSettings";

jest.mock("@/actions/userSettings.actions", () => ({
  getUserSettings: jest.fn(),
  updateAutomationSettings: jest.fn(),
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

// Suppress toast side-effects in tests
jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

import {
  getUserSettings,
  updateAutomationSettings,
} from "@/actions/userSettings.actions";

/** Default resolved settings returned by the mock server action. */
const defaultMockSettings = {
  success: true,
  data: {
    userId: "user-1",
    settings: {
      automation: {
        performanceWarningEnabled: true,
        performanceWarningThreshold: 10,
      },
    },
  },
};

describe("AutomationSettings", () => {
  const user = userEvent.setup({ skipHover: true });

  beforeEach(() => {
    jest.clearAllMocks();
    (getUserSettings as jest.Mock).mockResolvedValue(defaultMockSettings);
    (updateAutomationSettings as jest.Mock).mockResolvedValue({
      success: true,
    });
  });

  it("shows the loading state while settings are being fetched", () => {
    // Never resolve so the loading state persists during the assertion
    (getUserSettings as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<AutomationSettings />);

    expect(screen.getByText("Loading settings...")).toBeInTheDocument();
  });

  it("renders the performance warning toggle after settings load", async () => {
    render(<AutomationSettings />);

    await waitFor(() => {
      expect(screen.getByText("Performance Warning")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("switch", { name: "Performance Warning" }),
    ).toBeInTheDocument();
  });

  it("renders the threshold number input after settings load", async () => {
    render(<AutomationSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Warning Threshold")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Warning Threshold");
    expect(input).toHaveAttribute("type", "number");
  });

  it("displays the saved threshold value when settings are loaded", async () => {
    (getUserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        userId: "user-1",
        settings: {
          automation: {
            performanceWarningEnabled: true,
            performanceWarningThreshold: 25,
          },
        },
      },
    });

    render(<AutomationSettings />);

    await waitFor(() => {
      const input = screen.getByLabelText(
        "Warning Threshold",
      ) as HTMLInputElement;
      expect(input.value).toBe("25");
    });
  });

  it("displays the saved toggle state when settings are loaded", async () => {
    (getUserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        userId: "user-1",
        settings: {
          automation: {
            performanceWarningEnabled: false,
            performanceWarningThreshold: 10,
          },
        },
      },
    });

    render(<AutomationSettings />);

    await waitFor(() => {
      const toggle = screen.getByRole("switch", {
        name: "Performance Warning",
      });
      expect(toggle).toHaveAttribute("data-state", "unchecked");
    });
  });

  it("calls updateAutomationSettings with correct params when the toggle is clicked", async () => {
    render(<AutomationSettings />);

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Performance Warning" }),
      ).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch", { name: "Performance Warning" });
    await user.click(toggle);

    await waitFor(() => {
      expect(updateAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          performanceWarningEnabled: false,
          performanceWarningThreshold: 10,
        }),
      );
    });
  });

  it("calls updateAutomationSettings with correct threshold when the save button is clicked", async () => {
    render(<AutomationSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Warning Threshold")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Warning Threshold");
    await user.clear(input);
    await user.type(input, "20");

    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    await waitFor(() => {
      expect(updateAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          performanceWarningThreshold: 20,
          performanceWarningEnabled: true,
        }),
      );
    });
  });

  it("calls updateAutomationSettings with correct threshold when Enter is pressed in the input", async () => {
    render(<AutomationSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Warning Threshold")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Warning Threshold");
    await user.clear(input);
    await user.type(input, "15");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(updateAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          performanceWarningThreshold: 15,
        }),
      );
    });
  });

  it("does not call updateAutomationSettings for invalid (zero) threshold values", async () => {
    render(<AutomationSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Warning Threshold")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Warning Threshold");
    await user.clear(input);
    await user.type(input, "0");

    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    expect(updateAutomationSettings).not.toHaveBeenCalled();
  });

  it("renders the Automation Settings heading", async () => {
    render(<AutomationSettings />);

    await waitFor(() => {
      expect(screen.getByText("Automation Settings")).toBeInTheDocument();
    });
  });
});
