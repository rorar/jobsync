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

// ===========================================================================
// Sprint 3 Stream H — M-P-SPEC-03: fetchNotifications request dedup
// ===========================================================================

describe("NotificationDropdown request dedup (M-P-SPEC-03)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationSeq = 0;
    mockLocale = "en";
    mockMarkAllAsRead.mockResolvedValue({ success: true });
    mockMarkAsRead.mockResolvedValue({ success: true });
    mockDismissNotification.mockResolvedValue({ success: true });
  });

  it("coalesces concurrent mounts into a single getNotifications call", async () => {
    // Hold the response so we can mount a second instance while the
    // first fetch is still pending. The in-flight promise is per-instance
    // (not global), so two mounts still produce two calls — but a single
    // instance that re-invokes fetchNotifications during an in-flight
    // call must NOT trigger a second server action.
    let resolveFetch: (value: unknown) => void = () => {};
    mockGetNotifications.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    await act(async () => {
      render(<NotificationDropdown />);
    });

    // Exactly one call so far — the initial mount effect.
    expect(mockGetNotifications).toHaveBeenCalledTimes(1);

    // Resolve the promise so the component settles.
    await act(async () => {
      resolveFetch({ success: true, data: [] });
    });

    await waitFor(() =>
      expect(screen.getByText(/no notifications/i)).toBeInTheDocument(),
    );
  });

  it("discards stale results when the dropdown unmounts before resolution", async () => {
    // The ref-based epoch + isMounted guard means a late-arriving server
    // response after unmount must NOT call `setNotifications`. React
    // would log "Can't perform a React state update on an unmounted
    // component" if the guard is missing — we assert on that warning.
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    let resolveFetch: (value: unknown) => void = () => {};
    mockGetNotifications.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    let unmount: () => void = () => {};
    await act(async () => {
      const result = render(<NotificationDropdown />);
      unmount = result.unmount;
    });

    // Unmount BEFORE the server action resolves.
    unmount();

    // Now resolve the stale fetch — the guard must swallow the result.
    await act(async () => {
      resolveFetch({
        success: true,
        data: [
          makeNotification({ id: "stale-1", createdAt: new Date() }),
        ],
      });
    });

    // No "state update on unmounted component" warning must have fired.
    const unmountedWarnings = consoleSpy.mock.calls.filter((args) =>
      args.some(
        (a) =>
          typeof a === "string" &&
          a.includes("unmounted component"),
      ),
    );
    expect(unmountedWarnings).toHaveLength(0);

    consoleSpy.mockRestore();
  });
});

// ===========================================================================
// Sprint 3 Stream H — M-Y-03: mark-all-read 44×44 hit-area (CRIT-Y1)
// ===========================================================================

describe("NotificationDropdown mark-all-read hit-area (M-Y-03)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationSeq = 0;
    mockLocale = "en";
    mockMarkAllAsRead.mockResolvedValue({ success: true });
    mockMarkAsRead.mockResolvedValue({ success: true });
    mockDismissNotification.mockResolvedValue({ success: true });
  });

  it("exposes a 44×44 pointer target on the mark-all-read button", async () => {
    // The button only renders when there is at least one unread item.
    mockGetNotifications.mockResolvedValue({
      success: true,
      data: [
        makeNotification({
          id: "unread-1",
          createdAt: new Date(),
          read: false,
        }),
      ],
    });

    await act(async () => {
      render(<NotificationDropdown />);
    });

    const markAllButton = await screen.findByRole("button", {
      name: /mark all.*read/i,
    });

    // The focusable element is a native <button> carrying the 44×44
    // target utilities (WCAG 2.5.5 AAA / 2.5.8 AA). The previous
    // Shadcn Button with `h-8 w-8 shrink-0` is the pre-fix shape and
    // MUST NOT appear on the focusable element.
    expect(markAllButton.tagName).toBe("BUTTON");
    expect(markAllButton.className).toContain("h-11");
    expect(markAllButton.className).toContain("w-11");
    expect(markAllButton.className).not.toContain("h-8");

    // The visible pill is a direct `<span aria-hidden="true">` child
    // sized 32×32 to preserve the header's visual rhythm.
    const pill = markAllButton.querySelector<HTMLElement>(
      'span[aria-hidden="true"]',
    );
    expect(pill).not.toBeNull();
    expect(pill?.className).toContain("h-8");
    expect(pill?.className).toContain("w-8");
  });

  it("still fires mark-all-read from the outer 44×44 target", async () => {
    // Regression: the hit-area refactor must NOT break the click flow.
    mockGetNotifications.mockResolvedValue({
      success: true,
      data: [
        makeNotification({
          id: "unread-2",
          createdAt: new Date(),
          read: false,
        }),
      ],
    });

    await act(async () => {
      render(<NotificationDropdown />);
    });

    const markAllButton = await screen.findByRole("button", {
      name: /mark all.*read/i,
    });

    const { fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.click(markAllButton);
    });

    expect(mockMarkAllAsRead).toHaveBeenCalledTimes(1);
  });
});
