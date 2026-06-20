/**
 * PersonDetailClient — Inside Track connection wiring (Welle 5, Task 5.x #10).
 * Focused: the new "Add connection" action that lets a user create a directed
 * PersonConnection from this contact (powers 2-hop WarmPathFinder). Mocks the
 * action layer + stubs the heavy child components — asserts only the new wiring.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/i18n", () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: "en" }),
  formatDateShort: () => "Jun 1, 2026",
}));
const toast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

const getPerson = jest.fn();
const getPersons = jest.fn();
const addPersonConnection = jest.fn();
jest.mock("@/actions/person.actions", () => ({
  getPerson: (...a: unknown[]) => getPerson(...a),
  getPersons: (...a: unknown[]) => getPersons(...a),
  updatePerson: jest.fn(),
  archivePerson: jest.fn(),
  reactivatePerson: jest.fn(),
  anonymizePerson: jest.fn(),
  withdrawConsent: jest.fn(),
  reinstateConsent: jest.fn(),
}));
jest.mock("@/actions/personConnection.actions", () => ({
  addPersonConnection: (...a: unknown[]) => addPersonConnection(...a),
}));
jest.mock("@/actions/reference-data.actions", () => ({ getPersonHolidayInfo: jest.fn().mockResolvedValue(null) }));
jest.mock("@/actions/crmInterview.actions", () => ({ getInterviews: jest.fn().mockResolvedValue({ success: true, data: [] }) }));
jest.mock("@/actions/crmTask.actions", () => ({ getCrmTasks: jest.fn().mockResolvedValue({ success: true, data: [] }) }));
jest.mock("@/actions/crmNote.actions", () => ({ getCrmNotes: jest.fn().mockResolvedValue({ success: true, data: [] }) }));
jest.mock("@/actions/jobContact.actions", () => ({
  getJobContactsForPerson: jest.fn().mockResolvedValue({ success: true, data: [] }),
  removeJobContact: jest.fn(),
}));

// Stub heavy children (their behaviour is tested elsewhere).
jest.mock("@/components/crm/ActivityTimeline", () => ({ ActivityTimeline: () => <div /> }));
jest.mock("@/components/crm/HolidayBadge", () => ({ HolidayBadge: () => <div /> }));
jest.mock("@/components/crm/PersonForm", () => ({ __esModule: true, default: () => <div /> }));
// Stub AddConnectionForm to expose its onSubmit so we test the parent wiring.
jest.mock("@/components/inside-track/AddConnectionForm", () => ({
  AddConnectionForm: ({
    fromPersonId,
    onSubmit,
  }: {
    fromPersonId: string;
    onSubmit: (d: { toPersonId: string; kind: string; strength: string }) => void;
  }) => (
    <button
      data-testid="stub-add-conn"
      data-from={fromPersonId}
      onClick={() => onSubmit({ toPersonId: "p2", kind: "friend", strength: "close" })}
    >
      submit-conn
    </button>
  ),
}));
jest.mock("lucide-react", () =>
  new Proxy({}, { get: () => (p: React.SVGProps<SVGSVGElement>) => <svg {...p} /> }),
);

import PersonDetailClient from "@/app/dashboard/contacts/[id]/PersonDetailClient";

const activePerson = {
  id: "p1",
  firstName: "Mara",
  lastName: "Stone",
  status: "active",
  emails: [],
  phones: [],
  companies: [],
  socialProfiles: [],
  dataSource: "manual",
  processingBasis: "legitimate_interest",
  createdAt: new Date("2026-01-01"),
};

beforeEach(() => {
  jest.clearAllMocks();
  getPerson.mockResolvedValue({ success: true, data: activePerson });
  getPersons.mockResolvedValue({
    success: true,
    data: { persons: [{ id: "p2", firstName: "Bob", lastName: "Jones", emails: [], companies: [] }], total: 1 },
  });
  addPersonConnection.mockResolvedValue({ success: true, data: { id: "edge-1" } });
});

describe("PersonDetailClient — Add connection (Inside Track)", () => {
  it("shows the Add-connection action for an active contact + opens the sheet (loads persons)", async () => {
    render(<PersonDetailClient personId="p1" />);
    const btn = await screen.findByRole("button", { name: "insideTrack.addConnection.title" });
    await userEvent.click(btn);
    await waitFor(() => expect(getPersons).toHaveBeenCalled());
    expect(screen.getByTestId("stub-add-conn")).toHaveAttribute("data-from", "p1");
  });

  it("submitting calls addPersonConnection from THIS contact + toasts success", async () => {
    render(<PersonDetailClient personId="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "insideTrack.addConnection.title" }));
    await userEvent.click(await screen.findByTestId("stub-add-conn"));
    await waitFor(() =>
      expect(addPersonConnection).toHaveBeenCalledWith({
        fromPersonId: "p1",
        toPersonId: "p2",
        kind: "friend",
        strength: "close",
      }),
    );
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "insideTrack.toast.connectionAdded" }),
    );
  });
});
