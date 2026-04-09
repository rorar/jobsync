/**
 * NotificationDropdown tests.
 *
 * Covers:
 *   - H-NEW-05 — ARIA structure of the grouped notification list
 *     (no `role="feed"`, correct landmark, each item is an `<article>`
 *     carrying `aria-posinset` / `aria-setsize`).
 *   - H-T-07 — Date-bucket pure function `groupNotifications`:
 *     happy path, DST boundary, bucket edges, empty-group omission,
 *     future dates, determinism via injected `now`.
 *
 * Runs with the default local timezone (jsdom uses the host TZ). The
 * deterministic `now` parameter is injected directly, so tests do NOT
 * rely on `jest.useFakeTimers()` — they compute expected dates relative
 * to the pinned `now` using the same `setHours(0,0,0,0)` semantics as
 * the production code.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks — must be declared BEFORE the SUT is imported.
// ---------------------------------------------------------------------------

let mockLocale = "en";

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => {
    // Use the real dictionary so the component sees real translated strings
    // and axe-core / landmark assertions work against real labels.
    const { getDictionary } = jest.requireActual("@/i18n/dictionaries");
    const dict = getDictionary(mockLocale);
    return {
      t: (key: string) => dict[key] ?? key,
      locale: mockLocale,
    };
  }),
  formatRelativeTime: jest.fn(() => "3m ago"),
  formatDateTime: jest.fn(() => "Apr 9, 2026, 12:00 PM"),
}));

const mockGetNotifications = jest.fn();
const mockMarkAllAsRead = jest.fn();
const mockMarkAsRead = jest.fn();
const mockDismissNotification = jest.fn();

jest.mock("@/actions/notification.actions", () => ({
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  markAllAsRead: (...args: unknown[]) => mockMarkAllAsRead(...args),
  markAsRead: (...args: unknown[]) => mockMarkAsRead(...args),
  dismissNotification: (...args: unknown[]) => mockDismissNotification(...args),
}));

// Mock lucide-react icons (minimal stubs — real icons aren't needed for
// a11y / grouping assertions).
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

// ScrollArea — render children directly (no measure / virtualization).
jest.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

// Toast — swallow side effects.
jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import SUT AFTER mocks
// ---------------------------------------------------------------------------

import {
  NotificationDropdown,
  groupNotifications,
  getGroupKey,
  startOfDay,
  type NotificationGroup,
} from "@/components/layout/NotificationDropdown";
import type { Notification } from "@/models/notification.model";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let notificationSeq = 0;

function makeNotification(
  overrides: Partial<Notification> & { createdAt: Date },
): Notification {
  notificationSeq += 1;
  return {
    id: `notif-${notificationSeq}`,
    userId: "user-1",
    type: "vacancy_promoted",
    message: "Test notification",
    moduleId: null,
    automationId: null,
    data: null,
    severity: null,
    actorType: null,
    actorId: null,
    titleKey: null,
    titleParams: null,
    reasonKey: null,
    reasonParams: null,
    read: false,
    ...overrides,
  };
}

/**
 * Build a Date that is N local-calendar days before `reference`, at a
 * specific hour/minute. Uses setDate() so DST shifts are preserved.
 */
function daysBeforeLocal(
  reference: Date,
  days: number,
  hour = 12,
  minute = 0,
): Date {
  const d = new Date(reference);
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ===========================================================================
// H-T-07 — groupNotifications pure function
// ===========================================================================

describe("groupNotifications (H-T-07)", () => {
  // Pin `now` to a regular weekday, noon local time. Using noon keeps the
  // test free of early/late-in-day edge cases that would overlap with the
  // bucket-boundary tests below.
  const NOW = new Date(2026, 3, 9, 12, 0, 0, 0); // 2026-04-09 12:00 local

  beforeEach(() => {
    notificationSeq = 0;
  });

  it("buckets notifications across all 4 groups and preserves order", () => {
    const notifications: Notification[] = [
      makeNotification({ createdAt: new Date(NOW.getTime()) }), // today
      makeNotification({ createdAt: daysBeforeLocal(NOW, 1) }), // yesterday
      makeNotification({ createdAt: daysBeforeLocal(NOW, 3) }), // thisWeek
      makeNotification({ createdAt: daysBeforeLocal(NOW, 10) }), // earlier
    ];

    const groups = groupNotifications(notifications, NOW);

    // All 4 groups present in canonical order.
    expect(groups.map((g) => g.key)).toEqual([
      "today",
      "yesterday",
      "thisWeek",
      "earlier",
    ]);

    // Each bucket has exactly one item.
    groups.forEach((g) => expect(g.notifications).toHaveLength(1));
  });

  it("omits empty groups entirely (does not render zero-item sections)", () => {
    const notifications = [
      makeNotification({ createdAt: new Date(NOW.getTime()) }), // today only
      makeNotification({ createdAt: daysBeforeLocal(NOW, 30) }), // earlier only
    ];

    const groups = groupNotifications(notifications, NOW);

    // Yesterday and thisWeek have no members -> must be omitted.
    expect(groups.map((g) => g.key)).toEqual(["today", "earlier"]);
    expect(groups.find((g) => g.key === "yesterday")).toBeUndefined();
    expect(groups.find((g) => g.key === "thisWeek")).toBeUndefined();
  });

  it("returns an empty array for an empty input (no spurious group headers)", () => {
    expect(groupNotifications([], NOW)).toEqual([]);
  });

  describe("bucket boundaries", () => {
    it("a notification at today's midnight is in 'today'", () => {
      const midnight = startOfDay(NOW);
      expect(getGroupKey(midnight, NOW)).toBe("today");
    });

    it("a notification at 23:59:59 today is in 'today'", () => {
      const endOfToday = new Date(NOW);
      endOfToday.setHours(23, 59, 59, 999);
      expect(getGroupKey(endOfToday, NOW)).toBe("today");
    });

    it("a notification at yesterday 23:59 is in 'yesterday'", () => {
      const lateYesterday = daysBeforeLocal(NOW, 1, 23, 59);
      expect(getGroupKey(lateYesterday, NOW)).toBe("yesterday");
    });

    it("a notification at yesterday's midnight is in 'yesterday'", () => {
      const yesterdayMidnight = startOfDay(daysBeforeLocal(NOW, 1));
      expect(getGroupKey(yesterdayMidnight, NOW)).toBe("yesterday");
    });

    it("a notification 6 calendar days ago is in 'thisWeek'", () => {
      expect(getGroupKey(daysBeforeLocal(NOW, 6), NOW)).toBe("thisWeek");
    });

    it("a notification 7 calendar days ago is in 'earlier'", () => {
      expect(getGroupKey(daysBeforeLocal(NOW, 7), NOW)).toBe("earlier");
    });
  });

  describe("future dates", () => {
    it("a notification 1 hour in the future is in 'today' (clock skew tolerance)", () => {
      const future = new Date(NOW.getTime() + 60 * 60 * 1000);
      expect(getGroupKey(future, NOW)).toBe("today");
    });

    it("a notification 1 calendar day in the future is in 'today'", () => {
      const future = daysBeforeLocal(NOW, -1);
      expect(getGroupKey(future, NOW)).toBe("today");
    });
  });

  describe("DST boundary robustness", () => {
    // Europe/Berlin spring-forward: 2026-03-29 02:00 -> 03:00 (clocks skip).
    // A fixed-24h-ms division silently mis-counts on this day; the calendar
    // walk-back used in getGroupKey must still return the correct bucket
    // in the host's local timezone.
    it("handles a date 1 calendar day before a DST cutover", () => {
      // Pin NOW to the day AFTER the DST spring-forward in the Berlin TZ.
      // (The test asserts the CALENDAR relationship, which is TZ-agnostic:
      //  a notification with createdAt == NOW minus 1 calendar day must
      //  always land in 'yesterday', regardless of how many seconds that
      //  is in raw UTC.)
      const dayAfterDst = new Date(2026, 2, 30, 12, 0, 0, 0); // 2026-03-30
      const oneDayBefore = daysBeforeLocal(dayAfterDst, 1); // 2026-03-29
      expect(getGroupKey(oneDayBefore, dayAfterDst)).toBe("yesterday");
    });
  });

  describe("determinism", () => {
    it("accepts now as an optional argument — callers can pin the clock", () => {
      const notifications = [
        makeNotification({ createdAt: new Date(NOW.getTime()) }),
      ];
      const a = groupNotifications(notifications, NOW);
      const b = groupNotifications(notifications, NOW);
      expect(a).toEqual(b);
    });

    it("default now = new Date() still returns a valid structure", () => {
      // The default path must not crash — we only assert shape, not contents.
      const result = groupNotifications([]);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it("group ordering is stable even when input is out of order", () => {
      const notifications = [
        makeNotification({ createdAt: daysBeforeLocal(NOW, 10) }), // earlier
        makeNotification({ createdAt: new Date(NOW.getTime()) }), // today
        makeNotification({ createdAt: daysBeforeLocal(NOW, 1) }), // yesterday
      ];

      const groups = groupNotifications(notifications, NOW);
      expect(groups.map((g) => g.key)).toEqual([
        "today",
        "yesterday",
        "earlier",
      ]);
    });
  });

  describe("unreadCount per group", () => {
    it("counts unread notifications per group independently", () => {
      const notifications: Notification[] = [
        makeNotification({ createdAt: new Date(NOW.getTime()), read: false }),
        makeNotification({ createdAt: new Date(NOW.getTime()), read: true }),
        makeNotification({
          createdAt: daysBeforeLocal(NOW, 1),
          read: false,
        }),
      ];

      const groups = groupNotifications(notifications, NOW);
      const byKey = Object.fromEntries(
        groups.map((g: NotificationGroup) => [g.key, g]),
      );
      expect(byKey.today.unreadCount).toBe(1);
      expect(byKey.yesterday.unreadCount).toBe(1);
    });
  });
});

// ===========================================================================
// H-NEW-05 — ARIA structure / screen reader surface
// ===========================================================================

describe("NotificationDropdown a11y structure (H-NEW-05)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationSeq = 0;
    mockLocale = "en";
    mockMarkAllAsRead.mockResolvedValue({ success: true });
    mockMarkAsRead.mockResolvedValue({ success: true });
    mockDismissNotification.mockResolvedValue({ success: true });
  });

  it("renders a labelled region (NOT a feed) containing the notification list", async () => {
    // One of each bucket so the container renders groups.
    const now = new Date();
    mockGetNotifications.mockResolvedValue({
      success: true,
      data: [
        makeNotification({
          id: "a",
          createdAt: now,
          message: "Fresh notification",
        }),
      ],
    });

    await act(async () => {
      render(<NotificationDropdown />);
    });

    await waitFor(() =>
      expect(mockGetNotifications).toHaveBeenCalledWith(false, 50),
    );

    // The container MUST be a region (the feed-role authoring violation is
    // gone). Its accessible name is the notifications title.
    const region = await screen.findByRole("region", {
      name: /notifications/i,
    });
    expect(region).toBeInTheDocument();

    // Critically: no element with role="feed" should exist anywhere in
    // the tree. `feed` was the invalid parent of `<section>` children.
    expect(
      region.querySelector('[role="feed"]'),
    ).toBeNull();
  });

  it("children of the list are <article> elements with aria-posinset / aria-setsize", async () => {
    const now = new Date();
    mockGetNotifications.mockResolvedValue({
      success: true,
      data: [
        makeNotification({ id: "a", createdAt: now, message: "N1" }),
        makeNotification({ id: "b", createdAt: now, message: "N2" }),
        makeNotification({ id: "c", createdAt: now, message: "N3" }),
      ],
    });

    await act(async () => {
      render(<NotificationDropdown />);
    });

    // NotificationItem renders <article> natively (not a role attribute).
    // waitFor because getNotifications resolves asynchronously.
    await waitFor(() => {
      const articles =
        document.querySelectorAll<HTMLElement>("article");
      expect(articles.length).toBe(3);
    });

    const articles = document.querySelectorAll<HTMLElement>("article");

    // Every article must carry aria-posinset / aria-setsize so AT users
    // navigating article-by-article hear their position in the set.
    articles.forEach((article, index) => {
      expect(article.getAttribute("aria-posinset")).toBe(
        String(index + 1),
      );
      expect(article.getAttribute("aria-setsize")).toBe("3");
    });
  });

  it("renders the empty-state message when no notifications exist", async () => {
    mockGetNotifications.mockResolvedValue({ success: true, data: [] });

    await act(async () => {
      render(<NotificationDropdown />);
    });

    await waitFor(() =>
      expect(screen.getByText(/no notifications/i)).toBeInTheDocument(),
    );

    // The empty state intentionally does NOT render a region landmark.
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
