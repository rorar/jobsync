/**
 * NotificationItem component tests
 *
 * Tests the 5W+H rework: structured title/actor/reason/actions,
 * a11y (role="article", <time datetime>), late-bound i18n via titleKey,
 * dismiss button and deep-link action rendering.
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationItem } from "@/components/layout/NotificationItem";
import type { Notification } from "@/models/notification.model";

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "notifications.action.dismiss": "Dismiss",
        "notifications.action.openJob": "Open job",
        "notifications.action.viewStaged": "View staged",
        "notifications.action.openModules": "Open module settings",
        "notifications.action.openAutomation": "Open automation",
        "notifications.action.openApiKeys": "Manage API keys",
        "notifications.action.viewSettings": "View settings",
        "notifications.action.viewStaging": "Go to staging",
        "notifications.moduleDeactivated.title": "Module paused: {moduleName}",
        "notifications.vacancyBatchStaged.title":
          "{count} new vacancies from {automationName}",
        "notifications.actor.system": "System",
        "notifications.actor.automation": "Automation",
        "notifications.actor.user": "You",
        "notifications.title": "Notifications",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatRelativeTime: jest.fn(() => "2 hours ago"),
  formatDateTime: jest.fn(() => "April 8, 2026, 12:00 PM"),
}));

jest.mock("next/link", () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) {
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

  it("renders the legacy message when no titleKey is present", () => {
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

  it("renders late-bound title from titleKey + titleParams", () => {
    const notif = makeNotification({
      type: "module_deactivated",
      message: "legacy english fallback",
      data: {
        titleKey: "notifications.moduleDeactivated.title",
        titleParams: { moduleName: "EURES" },
      },
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    expect(screen.getByText("Module paused: EURES")).toBeInTheDocument();
    // The legacy fallback should NOT also be rendered
    expect(
      screen.queryByText("legacy english fallback"),
    ).not.toBeInTheDocument();
  });

  it("substitutes multiple params into the title", () => {
    const notif = makeNotification({
      type: "vacancy_batch_staged",
      data: {
        titleKey: "notifications.vacancyBatchStaged.title",
        titleParams: { count: 12, automationName: "EURES Berlin" },
      },
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    expect(
      screen.getByText("12 new vacancies from EURES Berlin"),
    ).toBeInTheDocument();
  });

  it("renders an action button derived from buildNotificationActions", () => {
    const notif = makeNotification({
      type: "vacancy_promoted",
      data: { jobId: "job-42" },
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    const link = screen.getByRole("link", { name: "Open job" });
    expect(link).toHaveAttribute("href", "/dashboard/myjobs/job-42");
  });

  it("renders the staging deep link for batch-staged notifications", () => {
    const notif = makeNotification({
      type: "vacancy_batch_staged",
      automationId: "auto-1",
      data: { automationId: "auto-1" },
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    const link = screen.getByRole("link", { name: "View staged" });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/staging?automationId=auto-1",
    );
  });

  it("does not render an action when contextual ids are missing", () => {
    const notif = makeNotification({
      type: "vacancy_promoted",
      data: null,
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    expect(screen.queryByRole("link", { name: "Open job" })).toBeNull();
  });

  it('uses role="article" instead of role="button" on the card', () => {
    const { container } = render(
      <NotificationItem
        notification={makeNotification()}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    const article = container.querySelector('article[aria-labelledby]');
    expect(article).not.toBeNull();
    // The outer card must not expose role="button" (a11y anti-pattern when
    // it contains nested interactive children).
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it("wraps the relative time in a <time> element with ISO datetime", () => {
    const { container } = render(
      <NotificationItem
        notification={makeNotification()}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    const time = container.querySelector("time");
    expect(time).not.toBeNull();
    expect(time).toHaveAttribute("datetime", "2026-04-08T12:00:00.000Z");
    // title attribute carries the absolute localized timestamp
    expect(time).toHaveAttribute("title", expect.stringContaining("April"));
  });

  it("renders the actor label when actor data is present", () => {
    const notif = makeNotification({
      data: {
        actorType: "system",
      },
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    expect(screen.getByText("System")).toBeInTheDocument();
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

  it("dismiss button fires onDismiss without navigating", () => {
    const notif = makeNotification({
      type: "vacancy_promoted",
      data: { jobId: "job-1" },
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    const dismissButton = screen.getByLabelText("Dismiss");
    fireEvent.click(dismissButton);
    expect(mockDismiss).toHaveBeenCalledWith("notif-1");
    // Dismiss MUST NOT trigger mark-as-read side effect
    expect(mockMarkAsRead).not.toHaveBeenCalled();
  });

  it("parses stringified JSON data", () => {
    const notif = makeNotification({
      data: JSON.stringify({
        jobId: "job-42",
      }) as unknown as Record<string, unknown>,
    });
    render(
      <NotificationItem
        notification={notif}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    expect(screen.getByRole("link", { name: "Open job" })).toBeInTheDocument();
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
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[parseNotificationData]"),
      expect.anything(),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  it("applies unread visual state when read=false", () => {
    const { container } = render(
      <NotificationItem
        notification={makeNotification({ read: false })}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    const article = container.querySelector("article");
    expect(article?.className).toContain("border-l-primary");
  });

  it("applies read styling when read=true", () => {
    const { container } = render(
      <NotificationItem
        notification={makeNotification({ read: true })}
        onMarkAsRead={mockMarkAsRead}
        onDismiss={mockDismiss}
      />,
    );
    const article = container.querySelector("article");
    expect(article?.className).not.toContain("border-l-primary");
  });
});
