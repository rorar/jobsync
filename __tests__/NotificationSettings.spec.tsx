import React from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationSettings from "@/components/settings/NotificationSettings";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/models/notification.model";

jest.mock("@/actions/userSettings.actions", () => ({
  getNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/actions/userSettings.actions";

const defaultResult = {
  success: true,
  data: DEFAULT_NOTIFICATION_PREFERENCES,
};

describe("NotificationSettings", () => {
  const user = userEvent.setup({ skipHover: true });

  beforeEach(() => {
    jest.clearAllMocks();
    (getNotificationPreferences as jest.Mock).mockResolvedValue(defaultResult);
    (updateNotificationPreferences as jest.Mock).mockResolvedValue({
      success: true,
    });
  });

  it("shows loading state while preferences are being fetched", () => {
    (getNotificationPreferences as jest.Mock).mockReturnValue(
      new Promise(() => {}),
    );

    render(<NotificationSettings />);
    expect(screen.getByText("Loading settings...")).toBeInTheDocument();
  });

  it("renders the global enable toggle after loading", async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(
        screen.getByLabelText("Enable notifications"),
      ).toBeInTheDocument();
    });
  });

  it("renders per-type toggles", async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText("Authentication Failure")).toBeInTheDocument();
      expect(
        screen.getByText("Consecutive Run Failures"),
      ).toBeInTheDocument();
      expect(screen.getByText("Module Deactivated")).toBeInTheDocument();
      expect(screen.getByText("Vacancy Promoted")).toBeInTheDocument();
      expect(screen.getByText("Bulk Action Completed")).toBeInTheDocument();
      expect(screen.getByText("Retention Cleanup")).toBeInTheDocument();
    });
  });

  // P0-2: disabling ALL notifications is destructive → must confirm first.
  it("confirms before disabling all notifications, then saves enabled:false", async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(
        screen.getByLabelText("Enable notifications"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Enable notifications"));

    // Confirmation dialog appears; nothing saved yet.
    await waitFor(() => {
      expect(
        screen.getByText("Disable all notifications?"),
      ).toBeInTheDocument();
    });
    expect(updateNotificationPreferences).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() => {
      expect(updateNotificationPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });
  });

  // P0-2: cancelling the confirmation must NOT disable notifications.
  it("does not disable notifications when the confirmation is cancelled", async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(
        screen.getByLabelText("Enable notifications"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Enable notifications"));
    await waitFor(() => {
      expect(
        screen.getByText("Disable all notifications?"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(updateNotificationPreferences).not.toHaveBeenCalled();
  });

  // P0-1: a fetch failure surfaces an error + retry instead of silently
  // rendering defaults as if the load succeeded.
  it("shows an error state with retry when preferences fail to load", async () => {
    (getNotificationPreferences as jest.Mock).mockResolvedValueOnce({
      success: false,
    });

    render(<NotificationSettings />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load notification preferences"),
      ).toBeInTheDocument();
    });

    // Retry re-fetches; second call succeeds → form renders.
    (getNotificationPreferences as jest.Mock).mockResolvedValueOnce(
      defaultResult,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(
        screen.getByLabelText("Enable notifications"),
      ).toBeInTheDocument();
    });
  });

  it("renders quiet hours section with toggle", async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Quiet Hours")).toBeInTheDocument();
    });
  });

  it("shows time inputs when quiet hours are enabled", async () => {
    (getNotificationPreferences as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        quietHours: {
          enabled: true,
          start: "22:00",
          end: "07:00",
          timezone: "Europe/Berlin",
        },
      },
    });

    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Start")).toBeInTheDocument();
      expect(screen.getByLabelText("End")).toBeInTheDocument();
      expect(screen.getByLabelText("Timezone")).toBeInTheDocument();
    });
  });

  it("loads saved preferences with some types disabled", async () => {
    (getNotificationPreferences as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        enabled: true,
        channels: { inApp: true },
        perType: { vacancy_promoted: { enabled: false } },
      },
    });

    render(<NotificationSettings />);

    await waitFor(() => {
      const vacancyToggle = screen.getByLabelText("Vacancy Promoted");
      expect(vacancyToggle).toBeInTheDocument();
      // The switch should not be checked
      expect(vacancyToggle).not.toBeChecked();
    });
  });
});
