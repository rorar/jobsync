import { ActivityForm } from "@/components/activities/ActivityForm";
import { Activity } from "@/models/activity.model";
import "@testing-library/jest-dom";
import { screen, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createActivity,
  updateActivity,
  getAllActivityTypes,
} from "@/actions/activity.actions";
import { toast } from "@/components/ui/use-toast";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "activities.activityName": "Activity Name",
        "activities.activityNamePlaceholder": "Enter activity name",
        "activities.activityType": "Activity Type",
        "activities.startDate": "Start Date",
        "activities.startTime": "Start Time",
        "activities.endDate": "End Date",
        "activities.endTime": "End Time",
        "activities.timePlaceholder": "HH:mm",
        "activities.description": "Description",
        "activities.durationLabel": "{hours}h {minutes}m",
        "activities.durationMinutesOnly": "{minutes}m",
        "activities.durationZero": "0m",
        "activities.durationExceedsMax": "Duration exceeds {max} hours",
        "activities.updatedSuccess": "Activity updated successfully",
        "activities.createdSuccess": "Activity created successfully",
        "common.cancel": "Cancel",
        "common.save": "Save",
        "common.error": "Error",
      };
      return translations[key] ?? key;
    },
    locale: "en",
  })),
  formatTime: jest.fn((date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    const m = minutes.toString().padStart(2, "0");
    return `${h}:${m} ${ampm}`;
  }),
}));

jest.mock("@/actions/activity.actions", () => ({
  createActivity: jest.fn().mockResolvedValue({ success: true }),
  updateActivity: jest.fn().mockResolvedValue({ success: true }),
  getAllActivityTypes: jest.fn().mockResolvedValue([
    { id: "type-1", label: "Learning", value: "learning" },
    { id: "type-2", label: "Job Search", value: "job-search" },
  ]),
  createActivityType: jest.fn(),
}));

jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

// ResizeObserver is already mocked in jest.setup.ts, but redefine for safety
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

document.createRange = () => {
  const range = new Range();

  range.getBoundingClientRect = jest.fn().mockReturnValue({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
  });

  range.getClientRects = () => {
    return {
      item: () => null,
      length: 0,
      [Symbol.iterator]: jest.fn(),
    };
  };

  return range;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

window.HTMLElement.prototype.scrollIntoView = jest.fn();
window.HTMLElement.prototype.hasPointerCapture = jest.fn();

const mockOnClose = jest.fn();
const mockReloadActivities = jest.fn();
const mockResetEditActivity = jest.fn();

const mockEditActivity: Activity = {
  id: "activity-123",
  activityName: "Study TypeScript",
  activityType: { id: "type-1", label: "Learning", value: "learning", createdAt: new Date(), updatedAt: new Date() },
  activityTypeId: "type-1",
  startTime: new Date("2026-03-25T09:00:00"),
  endTime: new Date("2026-03-25T10:30:00"),
  duration: 90,
  description: "<p>Studying advanced TS concepts</p>",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ActivityForm Component", () => {
  const user = userEvent.setup({ skipHover: true });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Create mode (no editActivity)", () => {
    it("renders in create mode when no editActivity prop is provided", async () => {
      render(
        <ActivityForm
          onClose={mockOnClose}
          reloadActivities={mockReloadActivities}
        />,
      );

      // The form should render activity name field with empty input
      const activityNameInput = screen.getByPlaceholderText("Enter activity name");
      expect(activityNameInput).toBeInTheDocument();
      expect(activityNameInput).toHaveValue("");
    });

    it("calls createActivity on submit when in create mode", async () => {
      render(
        <ActivityForm
          onClose={mockOnClose}
          reloadActivities={mockReloadActivities}
        />,
      );

      // Fill in required fields
      const activityNameInput = screen.getByPlaceholderText("Enter activity name");
      await user.clear(activityNameInput);
      await user.type(activityNameInput, "New Activity");

      // Select activity type via combobox
      const activityTypeCombobox = screen.getByRole("combobox");
      await user.click(activityTypeCombobox);
      const learningOption = await screen.findByRole("option", { name: "Learning" });
      await user.click(learningOption);

      // Submit
      const saveBtn = screen.getByTestId("save-activity-btn");
      await user.click(saveBtn);

      await waitFor(() => {
        expect(createActivity).toHaveBeenCalledTimes(1);
        expect(updateActivity).not.toHaveBeenCalled();
      });
    });

    it("shows success toast with 'created' message after create", async () => {
      render(
        <ActivityForm
          onClose={mockOnClose}
          reloadActivities={mockReloadActivities}
        />,
      );

      // Fill in required fields
      const activityNameInput = screen.getByPlaceholderText("Enter activity name");
      await user.clear(activityNameInput);
      await user.type(activityNameInput, "New Activity");

      // Select activity type via combobox
      const activityTypeCombobox = screen.getByRole("combobox");
      await user.click(activityTypeCombobox);
      const learningOption = await screen.findByRole("option", { name: "Learning" });
      await user.click(learningOption);

      // Submit
      const saveBtn = screen.getByTestId("save-activity-btn");
      await user.click(saveBtn);

      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "success",
            description: "Activity created successfully",
          }),
        );
      });
    });
  });

  describe("Edit mode (editActivity provided)", () => {
    it("renders in edit mode when editActivity prop is provided", async () => {
      render(
        <ActivityForm
          onClose={mockOnClose}
          reloadActivities={mockReloadActivities}
          editActivity={mockEditActivity}
          resetEditActivity={mockResetEditActivity}
        />,
      );

      // The form should render with the activity name pre-populated
      const activityNameInput = screen.getByPlaceholderText("Enter activity name");
      expect(activityNameInput).toBeInTheDocument();
      expect(activityNameInput).toHaveValue("Study TypeScript");
    });

    it("pre-populates form fields from editActivity", async () => {
      render(
        <ActivityForm
          onClose={mockOnClose}
          reloadActivities={mockReloadActivities}
          editActivity={mockEditActivity}
          resetEditActivity={mockResetEditActivity}
        />,
      );

      // Activity name should be pre-filled
      const activityNameInput = screen.getByPlaceholderText("Enter activity name");
      expect(activityNameInput).toHaveValue("Study TypeScript");

      // Start time should be pre-filled (formatted as 12h for en locale)
      const startTimeInput = screen.getByLabelText("Start Time");
      expect(startTimeInput).toHaveValue("9:00 AM");

      // End time should be pre-filled
      const endTimeInput = screen.getByDisplayValue("10:30 AM");
      expect(endTimeInput).toBeInTheDocument();
    });

    it("calls updateActivity (not createActivity) on submit when in edit mode", async () => {
      render(
        <ActivityForm
          onClose={mockOnClose}
          reloadActivities={mockReloadActivities}
          editActivity={mockEditActivity}
          resetEditActivity={mockResetEditActivity}
        />,
      );

      // Submit the form as-is (fields are already populated from editActivity)
      const saveBtn = screen.getByTestId("save-activity-btn");
      await user.click(saveBtn);

      await waitFor(() => {
        expect(updateActivity).toHaveBeenCalledTimes(1);
        expect(createActivity).not.toHaveBeenCalled();
      });

      // Verify updateActivity was called with the correct activity ID
      await waitFor(() => {
        expect(updateActivity).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "activity-123",
            activityName: "Study TypeScript",
          }),
        );
      });
    });

    it("shows success toast with 'updated' message after edit", async () => {
      render(
        <ActivityForm
          onClose={mockOnClose}
          reloadActivities={mockReloadActivities}
          editActivity={mockEditActivity}
          resetEditActivity={mockResetEditActivity}
        />,
      );

      const saveBtn = screen.getByTestId("save-activity-btn");
      await user.click(saveBtn);

      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "success",
            description: "Activity updated successfully",
          }),
        );
      });
    });

    it("calls resetEditActivity after successful update", async () => {
      render(
        <ActivityForm
          onClose={mockOnClose}
          reloadActivities={mockReloadActivities}
          editActivity={mockEditActivity}
          resetEditActivity={mockResetEditActivity}
        />,
      );

      const saveBtn = screen.getByTestId("save-activity-btn");
      await user.click(saveBtn);

      await waitFor(() => {
        expect(mockResetEditActivity).toHaveBeenCalledTimes(1);
      });
    });
  });
});
