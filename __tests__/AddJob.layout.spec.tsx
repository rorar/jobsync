/**
 * AddJob layout (Welle 4, F-AJ-03): the Status field must render directly above
 * the Date Applied field (applied-merge reads top-to-bottom: pick status → date).
 */
import "@testing-library/jest-dom";
import React from "react";
import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddJob } from "@/components/myjobs/AddJob";
import { JOB_STATUSES } from "@/lib/data/jobStatusesData";
import { JOB_SOURCES } from "@/lib/data/jobSourcesData";
import { getMockList } from "@/lib/mock.utils";
import { CATEGORY_SEED, categorySemanticsForKind, type StatusCategoryKind } from "@/lib/crm/status-categories";

jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/actions/job.actions", () => ({
  addJob: jest.fn().mockResolvedValue({ success: true }),
  addJobToQueue: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("@/actions/reference-data.actions", () => ({ getCurrencyOptions: jest.fn().mockResolvedValue([]) }));
jest.mock("@/actions/userSettings.actions", () => ({ getJobFormSettings: jest.fn().mockResolvedValue({ fixumDisablesRange: true }) }));
jest.mock("@/actions/person.actions", () => ({ getPersons: jest.fn().mockResolvedValue({ success: true, data: { persons: [], total: 0 } }) }));
jest.mock("@/actions/jobContact.actions", () => ({ addJobContact: jest.fn().mockResolvedValue({ success: true, data: { id: "x" } }) }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), back: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
}));
global.ResizeObserver = jest.fn().mockImplementation(() => ({ observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() }));

const K: Record<string, StatusCategoryKind> = {
  draft: "lead", applied: "applied", interview: "interviewing", offer: "offer",
  rejected: "lost", expired: "archived", archived: "archived",
};
const statuses = JOB_STATUSES.map((s, i) => ({
  ...s, sortOrder: 0, isDefault: i === 0,
  category: { id: `c-${K[s.value]}`, label: CATEGORY_SEED[K[s.value]].label, colour: CATEGORY_SEED[K[s.value]].colour, ...categorySemanticsForKind(K[s.value]) },
}));

test("Status field renders before (above) Date Applied", async () => {
  const user = userEvent.setup({ skipHover: true });
  const c = (await getMockList(1, 10, "companies")).data;
  const jt = (await getMockList(1, 10, "jobTitles")).data;
  const l = (await getMockList(1, 10, "locations")).data;
  render(
    <AddJob jobStatuses={statuses as never} companies={c} jobTitles={jt} locations={l}
      jobSources={JOB_SOURCES} tags={[]} editJob={null} resetEditJob={jest.fn()} />,
  );
  await user.click(screen.getByTestId("add-job-btn"));

  const group = screen.getByTestId("status-dateapplied-group");
  const statusTrigger = screen.getByTestId("status-combobox-trigger");
  const dateAppliedLabel = screen.getByText("Date Applied");

  // both live in the dedicated group, Status before Date Applied
  expect(group).toContainElement(statusTrigger);
  expect(group).toContainElement(dateAppliedLabel);
  expect(
    statusTrigger.compareDocumentPosition(dateAppliedLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
