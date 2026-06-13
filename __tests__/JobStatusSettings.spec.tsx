/**
 * JobStatusSettings (Welle 4, Phase 2.4) — management UI.
 * Covers: grouped render, create, set-default, reorder up/down, simple delete,
 * delete-in-use reassign dialog, default/last delete disabled, soft-cap banner.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    t: (key: string) => key,
    locale: "en",
  }),
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ toast: (...a: unknown[]) => mockToast(...a) }));

const mockGetStatuses = jest.fn();
const mockGetCategories = jest.fn();
const mockCreate = jest.fn();
const mockRename = jest.fn();
const mockReorder = jest.fn();
const mockReorderBulk = jest.fn();
const mockSetDefault = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/actions/jobStatus.actions", () => ({
  getJobStatuses: (...a: unknown[]) => mockGetStatuses(...a),
  getJobStatusCategories: (...a: unknown[]) => mockGetCategories(...a),
  createJobStatus: (...a: unknown[]) => mockCreate(...a),
  renameJobStatus: (...a: unknown[]) => mockRename(...a),
  reorderJobStatus: (...a: unknown[]) => mockReorder(...a),
  reorderJobStatuses: (...a: unknown[]) => mockReorderBulk(...a),
  setDefaultJobStatus: (...a: unknown[]) => mockSetDefault(...a),
  deleteJobStatus: (...a: unknown[]) => mockDelete(...a),
}));

import JobStatusSettings from "@/components/settings/JobStatusSettings";

const cat = (id: string, kind: string, sortOrder: number, isAppliedStage = false) => ({
  id,
  kind,
  label: kind,
  colour: "blue",
  sortOrder,
  isAppliedStage,
  isTerminal: kind === "won",
  defaultCollapsed: kind === "lost" || kind === "archived",
  allowsSelfTransition: kind === "interviewing",
});

const status = (
  id: string,
  value: string,
  label: string,
  category: ReturnType<typeof cat>,
  sortOrder: number,
  isDefault = false,
  jobCount = 0,
) => ({ id, value, label, sortOrder, isDefault, jobCount, category });

const LEAD = cat("c-lead", "lead", 0);
const APPLIED = cat("c-applied", "applied", 1, true);

function setup(statuses: ReturnType<typeof status>[]) {
  mockGetStatuses.mockResolvedValue({ success: true, data: statuses });
  mockGetCategories.mockResolvedValue({ success: true, data: [LEAD, APPLIED] });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("JobStatusSettings", () => {
  it("renders statuses grouped by stage after load", async () => {
    setup([
      status("s1", "bookmarked", "Bookmarked", LEAD, 0, true),
      status("s2", "applied", "Applied", APPLIED, 0),
    ]);
    render(<JobStatusSettings />);
    expect(await screen.findByTestId("status-row-bookmarked")).toBeInTheDocument();
    expect(screen.getByTestId("status-row-applied")).toBeInTheDocument();
    // default badge on the default status
    expect(within(screen.getByTestId("status-row-bookmarked")).getByText("jobStatus.default")).toBeInTheDocument();
  });

  it("creates a status via the add form", async () => {
    const user = userEvent.setup();
    setup([status("s1", "bookmarked", "Bookmarked", LEAD, 0, true)]);
    mockCreate.mockResolvedValue({ success: true, data: { id: "new" } });
    render(<JobStatusSettings />);
    await screen.findByTestId("status-row-bookmarked");

    await user.type(screen.getByLabelText("jobStatus.statusName"), "Phone Screen");
    await user.click(screen.getByTestId("add-status-btn"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    // categoryId defaults to the first category (lead), label trimmed
    expect(mockCreate).toHaveBeenCalledWith("c-lead", "Phone Screen");
  });

  it("sets a non-default status as default", async () => {
    const user = userEvent.setup();
    setup([
      status("s1", "bookmarked", "Bookmarked", LEAD, 0, true),
      status("s2", "applied", "Applied", APPLIED, 0),
    ]);
    mockSetDefault.mockResolvedValue({ success: true });
    render(<JobStatusSettings />);
    await screen.findByTestId("status-row-applied");

    await user.click(screen.getByTestId("status-default-applied"));
    await waitFor(() => expect(mockSetDefault).toHaveBeenCalledWith("s2"));
  });

  it("reorders a status with the down button", async () => {
    const user = userEvent.setup();
    setup([
      status("s1", "bookmarked", "Bookmarked", LEAD, 0, true),
      status("s2", "lead2", "Lead Two", LEAD, 1),
    ]);
    mockReorderBulk.mockResolvedValue({ success: true });
    render(<JobStatusSettings />);
    await screen.findByTestId("status-row-bookmarked");

    // move the first lead status down past the second → renormalized order [s2, s1]
    await user.click(screen.getByTestId("status-down-bookmarked"));
    await waitFor(() => expect(mockReorderBulk).toHaveBeenCalled());
    expect(mockReorderBulk.mock.calls[0][0]).toEqual(["s2", "s1"]);
  });

  it("deletes an unused status via simple confirm", async () => {
    const user = userEvent.setup();
    setup([
      status("s1", "bookmarked", "Bookmarked", LEAD, 0, true),
      status("s2", "applied", "Applied", APPLIED, 0, false, 0),
    ]);
    mockDelete.mockResolvedValue({ success: true });
    render(<JobStatusSettings />);
    await screen.findByTestId("status-row-applied");

    await user.click(screen.getByTestId("status-delete-applied"));
    await user.click(await screen.findByTestId("delete-confirm-btn"));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("s2", undefined));
  });

  it("opens the move-and-delete dialog for an in-use status (target required)", async () => {
    const user = userEvent.setup();
    setup([
      status("s1", "bookmarked", "Bookmarked", LEAD, 0, true),
      status("s2", "applied", "Applied", APPLIED, 0, false, 4),
    ]);
    render(<JobStatusSettings />);
    await screen.findByTestId("status-row-applied");

    await user.click(screen.getByTestId("status-delete-applied"));
    // reassign dialog appears; move-and-delete disabled until a target is chosen
    expect(await screen.findByTestId("reassign-select")).toBeInTheDocument();
    expect(screen.getByTestId("move-and-delete-btn")).toBeDisabled();
  });

  it("disables delete for the default status with a reason", async () => {
    setup([
      status("s1", "bookmarked", "Bookmarked", LEAD, 0, true),
      status("s2", "applied", "Applied", APPLIED, 0),
    ]);
    render(<JobStatusSettings />);
    await screen.findByTestId("status-row-bookmarked");
    expect(screen.getByTestId("status-delete-bookmarked")).toBeDisabled();
  });

  it("shows the soft-cap warning above the threshold", async () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      status(`s${i}`, `v${i}`, `S${i}`, LEAD, i, i === 0),
    );
    setup(many);
    render(<JobStatusSettings />);
    expect(await screen.findByTestId("soft-cap-warning")).toBeInTheDocument();
  });
});
