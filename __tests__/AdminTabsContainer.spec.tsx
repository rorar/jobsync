import "@testing-library/jest-dom";
import { screen, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminTabsContainer from "@/components/admin/AdminTabsContainer";

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/dashboard/admin",
  useSearchParams: () => new URLSearchParams(""),
}));

jest.mock("@/actions/company.actions", () => ({
  getCompanyList: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getCompanyById: jest.fn(),
}));

jest.mock("@/actions/jobtitle.actions", () => ({
  getJobTitleList: jest.fn().mockResolvedValue({ data: [], total: 0 }),
}));

jest.mock("@/actions/jobLocation.actions", () => ({
  getJobLocationsList: jest.fn().mockResolvedValue({ data: [], total: 0 }),
}));

// Radix only mounts the ACTIVE TabsContent (Presence with
// `present: forceMount || isSelected`, @radix-ui/react-tabs dist/index.mjs:157),
// so the render-only tests never reach this module. The tab-switch test does:
// clicking a trigger makes that tab active, which mounts its container and runs
// its load effect. That is why jobtitle.actions and jobLocation.actions above
// are mocked and jobSource.actions/tag.actions — whose tabs nobody clicks — are
// not, and it is why activity-types needs a mock of its own.
jest.mock("@/actions/activity.actions", () => ({
  getActivityTypeList: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  deleteActivityTypeById: jest.fn(),
}));

describe("AdminTabsContainer", () => {
  const user = userEvent.setup({ skipHover: true });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render all six reference tabs", () => {
    render(<AdminTabsContainer />);

    expect(screen.getByRole("tab", { name: "Companies" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Job Titles" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Locations" })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sources" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Skills" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Activity Types" })
    ).toBeInTheDocument();
  });

  it("should default to companies tab", () => {
    render(<AdminTabsContainer />);

    const companiesTab = screen.getByRole("tab", { name: "Companies" });
    expect(companiesTab).toHaveAttribute("data-state", "active");
  });

  it("should switch tabs and update URL", async () => {
    render(<AdminTabsContainer />);

    const jobTitlesTab = screen.getByRole("tab", { name: "Job Titles" });
    await user.click(jobTitlesTab);

    expect(mockReplace).toHaveBeenCalledWith(
      "/dashboard/admin?tab=job-titles"
    );
  });

  it("should switch to locations tab and update URL", async () => {
    render(<AdminTabsContainer />);

    const locationsTab = screen.getByRole("tab", { name: "Locations" });
    await user.click(locationsTab);

    expect(mockReplace).toHaveBeenCalledWith(
      "/dashboard/admin?tab=locations"
    );
  });

  // The slug matters beyond the URL: the E2E cleanup helper navigates straight
  // to /dashboard/admin?tab=activity-types and never clicks the tab list.
  it("should switch to activity types tab and update URL", async () => {
    render(<AdminTabsContainer />);

    const activityTypesTab = screen.getByRole("tab", { name: "Activity Types" });
    await user.click(activityTypesTab);

    expect(mockReplace).toHaveBeenCalledWith(
      "/dashboard/admin?tab=activity-types"
    );
  });

  // UI-B6: `replace` rather than `push`. The tab is view state; pushing made
  // Back walk the user through every tab they had opened instead of leaving the
  // page.
  it("should not push a history entry when switching tabs", async () => {
    render(<AdminTabsContainer />);

    await user.click(screen.getByRole("tab", { name: "Locations" }));

    expect(mockPush).not.toHaveBeenCalled();
  });

  // UI-B7: manual activation. Radix's default would select each tab an arrow
  // key lands on, and selecting one mounts its container and fires its load.
  it("should move focus without activating when arrowing through the tab list", async () => {
    render(<AdminTabsContainer />);

    const companiesTab = screen.getByRole("tab", { name: "Companies" });
    companiesTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Job Titles" })).toHaveFocus();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(companiesTab).toHaveAttribute("data-state", "active");
  });

  it("should activate the focused tab on Enter", async () => {
    render(<AdminTabsContainer />);

    screen.getByRole("tab", { name: "Companies" }).focus();
    await user.keyboard("{ArrowRight}{Enter}");

    expect(mockReplace).toHaveBeenCalledWith("/dashboard/admin?tab=job-titles");
  });

  it("should render companies tab panel content by default", async () => {
    render(<AdminTabsContainer />);

    await waitFor(() => {
      expect(screen.getByTestId("add-company-btn")).toBeInTheDocument();
    });
  });
});
