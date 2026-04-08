/**
 * NotificationItem component tests
 *
 * Tests: message rendering, job/automation links, UUID validation,
 * mark-as-read behavior, dismiss button i18n, JSON data parsing.
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationItem } from "@/components/layout/NotificationItem";
import type { Notification } from "@/models/notification.model";

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "notifications.dismiss": "Dismiss",
        "notifications.viewJob": "View job",
        "notifications.viewAutomation": "View automation",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatRelativeTime: jest.fn(() => "2 hours ago"),
}));

jest.mock("next/link", () => {
  return function MockLink({ children, href, ...props }: any) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

// Lucide icons -- minimal stubs
jest.mock("lucide-react", () => {
  const icons = new Proxy(
    {},
    {
      get: (_, name) => {
        const Component = (props: Record<string, unknown>) => (
          <span data-testid={`icon-${String(name)}`} {...props} />
        );
        Component.displayName = String(name);
        return Component;
      },
    },
  );
  return icons;
});

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    userId: "user-1",
    type: "vacancy_promoted",
    message: "Job created from staged vacancy",
    moduleId: null,
    automationId: null,
    read: false,
    data: null,
    createdAt: new Date("2026-04-08T12:00:00Z"),
    ...overrides,
  };
}

describe("NotificationItem", () => {
  const mockMarkAsRead = jest.fn();
  const mockDismiss = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it("renders notification message", () => {
    render(
      <NotificationItem
        notification={makeNotification()}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    expect(
      screen.getByText("Job created from staged vacancy"),
    ).toBeInTheDocument();
  });

  it("renders job link for vacancy_promoted with jobId in data", () => {
    const notif = makeNotification({
      data: {
        jobId: "550e8400-e29b-41d4-a716-446655440000",
        stagedVacancyId: "sv-1",
      },
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    const link = screen.getByText("View job");
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/dashboard/myjobs/550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("does NOT render job link when jobId is not a valid UUID", () => {
    const notif = makeNotification({
      data: { jobId: "../../admin", stagedVacancyId: "sv-1" },
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    expect(screen.queryByText("View job")).not.toBeInTheDocument();
  });

  it("renders automation arrow link with aria-label", () => {
    const notif = makeNotification({
      type: "vacancy_batch_staged",
      automationId: "auto-1",
      data: null,
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    const link = screen.getByLabelText("View automation");
    expect(link).toHaveAttribute("href", "/dashboard/automations/auto-1");
  });

  it("renders no link when no data and no automationId", () => {
    const notif = makeNotification({
      type: "retention_completed",
      data: null,
      automationId: null,
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    expect(screen.queryByText("View job")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("View automation")).not.toBeInTheDocument();
  });

  it("calls onMarkAsRead when clicking unread notification", () => {
    render(
      <NotificationItem
        notification={makeNotification({ read: false })}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]); // Click the notification container (role="button"), not dismiss
    expect(mockMarkAsRead).toHaveBeenCalledWith("notif-1");
  });

  it("does not call onMarkAsRead when clicking already-read notification", () => {
    render(
      <NotificationItem
        notification={makeNotification({ read: true })}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    // The outer div has role="button" — click it (not the dismiss button)
    const buttons = screen.getAllByRole("button");
    // The first role="button" is the outer div, the second is the dismiss button
    fireEvent.click(buttons[0]);
    expect(mockMarkAsRead).not.toHaveBeenCalled();
  });

  it("dismiss button has i18n aria-label", () => {
    render(
      <NotificationItem
        notification={makeNotification()}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    expect(screen.getByLabelText("Dismiss")).toBeInTheDocument();
  });

  it("parses stringified JSON data", () => {
    const notif = makeNotification({
      data: JSON.stringify({
        jobId: "550e8400-e29b-41d4-a716-446655440000",
      }) as unknown as Record<string, unknown>,
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    expect(screen.getByText("View job")).toBeInTheDocument();
  });

  it("handles malformed JSON data gracefully", () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
    const notif = makeNotification({
      data: "not-json{{{" as unknown as Record<string, unknown>,
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    expect(screen.queryByText("View job")).not.toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[parseNotificationData]"),
      expect.anything(),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });
});
