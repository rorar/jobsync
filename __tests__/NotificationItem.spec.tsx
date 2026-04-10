/**
 * NotificationItem component tests
 *
 * Tests the 5W+H rework: structured title/actor/reason/actions,
 * a11y (role="article", <time datetime>), late-bound i18n via titleKey,
 * dismiss button and deep-link action rendering.
 *
 * Sprint 3 Stream H additions:
 *   - M-P-05 regression guard: `parseNotificationData` runs once per
 *     distinct `(id, data)` pair, not on every render.
 *   - M-Y-02 regression guard: dismiss button exposes a 44×44 pointer
 *     target via the invisible hit-area wrapper pattern (CRIT-Y1).
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
        // L-Y-03 (Sprint 4 Stream E) — translated sr-only word for the
        // unread-dot indicator. Used by the regression test below.
        "notifications.unreadIndicator": "Unread",
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
    // ADR-030 top-level 5W+H columns — default to null so legacy fallback
    // tests (read from `data.*`) still exercise the old path.
    severity: null,
    actorType: null,
    actorId: null,
    titleKey: null,
    titleParams: null,
    reasonKey: null,
    reasonParams: null,
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

  // ---------------------------------------------------------------------------
  // ADR-030: top-level 5W+H columns — prefer columns, fall back to data.*
  // ---------------------------------------------------------------------------

  describe("ADR-030 top-level column precedence", () => {
    it("prefers the top-level titleKey column over data.titleKey", () => {
      // Dual-written notification: both carry a titleKey, but they differ.
      // The top-level column must win so re-translations pick up any schema
      // fix shipped after the legacy blob was persisted.
      const notif = makeNotification({
        type: "module_deactivated",
        message: "legacy english fallback",
        titleKey: "notifications.moduleDeactivated.title",
        titleParams: { moduleName: "EURES (column)" },
        data: {
          titleKey: "notifications.moduleDeactivated.title",
          titleParams: { moduleName: "EURES (legacy)" },
        },
      });
      render(
        <NotificationItem
          notification={notif}
          onMarkAsRead={mockMarkAsRead}
          onDismiss={mockDismiss}
        />,
      );
      // Top-level column wins
      expect(
        screen.getByText("Module paused: EURES (column)"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Module paused: EURES (legacy)"),
      ).not.toBeInTheDocument();
    });

    it("falls back to legacy data.titleKey when top-level column is null", () => {
      // Pre-migration notification: titleKey=null on the row, but legacy
      // data.titleKey is still populated. The formatter must fall back.
      const notif = makeNotification({
        type: "module_deactivated",
        message: "legacy english fallback",
        titleKey: null,
        titleParams: null,
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
      expect(
        screen.queryByText("legacy english fallback"),
      ).not.toBeInTheDocument();
    });

    it("prefers the top-level severity column over data.severity", () => {
      // Top-level severity is "error"; legacy data.severity is "info".
      // Columns win → the error icon should render. Use a type that does
      // NOT short-circuit to the Briefcase icon (vacancy_promoted does).
      const notif = makeNotification({
        type: "module_deactivated",
        severity: "error",
        data: { severity: "info" },
      });
      const { container } = render(
        <NotificationItem
          notification={notif}
          onMarkAsRead={mockMarkAsRead}
          onDismiss={mockDismiss}
        />,
      );
      // SeverityIcon renders the XCircle lucide stub for "error"; the
      // lucide Proxy mock gives us `icon-XCircle` as the test-id.
      expect(container.querySelector('[data-testid="icon-XCircle"]')).not.toBeNull();
    });

    it("uses the top-level actorType column when data.actorType is missing", () => {
      const notif = makeNotification({
        actorType: "system",
        data: null,
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
  });

  // ---------------------------------------------------------------------------
  // Sprint 3 Stream H — M-Y-02: 44×44 dismiss button hit-area (CRIT-Y1)
  // ---------------------------------------------------------------------------

  describe("Sprint 3 Stream H — dismiss button hit-area (M-Y-02)", () => {
    it("exposes a 44×44 pointer target via `h-11 w-11` outer button", () => {
      render(
        <NotificationItem
          notification={makeNotification()}
          onMarkAsRead={mockMarkAsRead}
          onDismiss={mockDismiss}
        />,
      );
      const dismissButton = screen.getByLabelText("Dismiss");
      // The focusable element is a native <button> (NOT the previous
      // Shadcn Button with h-8 w-8). Its class list must contain the
      // WCAG 2.5.5 AAA 44px target utilities.
      expect(dismissButton.tagName).toBe("BUTTON");
      expect(dismissButton.className).toContain("h-11");
      expect(dismissButton.className).toContain("w-11");
    });

    it("keeps the visible pill at 32×32 inside the 44×44 target", () => {
      render(
        <NotificationItem
          notification={makeNotification()}
          onMarkAsRead={mockMarkAsRead}
          onDismiss={mockDismiss}
        />,
      );
      const dismissButton = screen.getByLabelText("Dismiss");
      // The visible pill is a direct <span aria-hidden="true"> child
      // whose size utilities define the *visual* weight without
      // shrinking the hit-area.
      const pill = dismissButton.querySelector<HTMLElement>(
        'span[aria-hidden="true"]',
      );
      expect(pill).not.toBeNull();
      expect(pill?.className).toContain("h-8");
      expect(pill?.className).toContain("w-8");
    });

    it("preserves keyboard focus ring on the 44×44 wrapper", () => {
      render(
        <NotificationItem
          notification={makeNotification()}
          onMarkAsRead={mockMarkAsRead}
          onDismiss={mockDismiss}
        />,
      );
      const dismissButton = screen.getByLabelText("Dismiss");
      // The focus-visible ring MUST live on the focusable element
      // (the 44×44 outer button), NOT on the decorative inner pill —
      // otherwise keyboard users get a ring on a smaller visual target
      // than their pointer hit-area, which is confusing.
      expect(dismissButton.className).toContain("focus-visible:ring-2");
    });

    it("still fires onDismiss from the outer 44×44 target", () => {
      // Regression: the hit-area refactor must NOT break the dismiss
      // click flow (this was the CRIT-A-06 failure mode for DeckCard).
      const notif = makeNotification({
        type: "vacancy_promoted",
        data: { jobId: "job-1" },
        id: "notif-hitarea",
      });
      render(
        <NotificationItem
          notification={notif}
          onMarkAsRead={mockMarkAsRead}
          onDismiss={mockDismiss}
        />,
      );
      fireEvent.click(screen.getByLabelText("Dismiss"));
      expect(mockDismiss).toHaveBeenCalledWith("notif-hitarea");
      expect(mockMarkAsRead).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Sprint 4 Stream E — L-Y-03: translated unread-dot sr-only indicator
  // ---------------------------------------------------------------------------

  describe("Sprint 4 Stream E — L-Y-03 translated unread indicator", () => {
    it("renders the translated 'Unread' string for unread items (not a bullet glyph)", () => {
      const { container } = render(
        <NotificationItem
          notification={makeNotification({ read: false })}
          onMarkAsRead={mockMarkAsRead}
          onDismiss={mockDismiss}
        />,
      );
      // The sr-only span should contain the translated word, not the
      // pre-fix `•` bullet character.
      const srOnlySpans = Array.from(
        container.querySelectorAll<HTMLElement>("span.sr-only"),
      );
      const unreadSpan = srOnlySpans.find(
        (span) => span.textContent?.trim() === "Unread",
      );
      expect(unreadSpan).toBeDefined();
      // L-Y-03 direct regression guard: the raw bullet glyph MUST NOT
      // appear in any sr-only descendant.
      for (const span of srOnlySpans) {
        expect(span.textContent).not.toBe("•");
      }
    });

    it("does NOT render the unread indicator when the notification is read", () => {
      const { container } = render(
        <NotificationItem
          notification={makeNotification({ read: true })}
          onMarkAsRead={mockMarkAsRead}
          onDismiss={mockDismiss}
        />,
      );
      const srOnlySpans = Array.from(
        container.querySelectorAll<HTMLElement>("span.sr-only"),
      );
      const unreadSpan = srOnlySpans.find(
        (span) => span.textContent?.trim() === "Unread",
      );
      expect(unreadSpan).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Sprint 3 Stream H — M-P-05: parseNotificationData memoization
  // ---------------------------------------------------------------------------

  describe("Sprint 3 Stream H — parseNotificationData memo (M-P-05)", () => {
    it("does not re-parse stringified JSON when the parent re-renders with a stable data reference", () => {
      // We can't patch the un-exported parseNotificationData directly,
      // so we use console.warn as a proxy: feeding malformed JSON once
      // triggers exactly ONE warn per parse. If the memo works, a
      // parent re-render with the same `data` reference must NOT cause
      // a second warn. Before the fix, the inline call re-parsed on
      // every render and logged twice.
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const malformed = "not-json{{{" as unknown as Record<string, unknown>;
      const notif = makeNotification({
        id: "memo-1",
        data: malformed,
      });

      const { rerender } = render(
        <NotificationItem
          notification={notif}
          onMarkAsRead={mockMarkAsRead}
          onDismiss={mockDismiss}
        />,
      );
      const warnCountAfterFirstRender = consoleSpy.mock.calls.length;
      expect(warnCountAfterFirstRender).toBeGreaterThanOrEqual(1);

      // Force a re-render with the SAME notification object reference.
      // Without the useMemo, parseNotificationData would run again and
      // bump the warn count. With the memo (keyed on `notification.id`
      // + `notification.data`), the parsed value is reused.
      rerender(
        <NotificationItem
          notification={notif}
          onMarkAsRead={mockMarkAsRead}
          onDismiss={mockDismiss}
        />,
      );
      // MEMO GUARD: warn count must be unchanged on the second render.
      expect(consoleSpy.mock.calls.length).toBe(warnCountAfterFirstRender);

      // Sanity check: passing a DIFFERENT malformed data reference
      // (same string, different identity) SHOULD re-parse because the
      // memo is keyed on reference equality.
      const notif2 = makeNotification({
        id: "memo-2",
        data: "also-not-json" as unknown as Record<string, unknown>,
      });
      rerender(
        <NotificationItem
          notification={notif2}
          onMarkAsRead={mockMarkAsRead}
          onDismiss={mockDismiss}
        />,
      );
      expect(consoleSpy.mock.calls.length).toBeGreaterThan(
        warnCountAfterFirstRender,
      );

      consoleSpy.mockRestore();
    });
  });
});
