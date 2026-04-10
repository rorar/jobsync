/**
 * NotificationBell Component Tests
 *
 * Tests: unread count badge visibility, polling behavior
 * Spec: specs/notification-dispatch.allium (surface NotificationBell)
 *
 * Sprint 3 Stream H additions:
 *   - M-Y-07 regression guards: aria-live region exists, announces ONLY on
 *     count increases, debounces rapid changes (500ms stability window),
 *     does not re-announce on decreases, and does not double-announce via
 *     the visible badge (which is aria-hidden).
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockLocale = "en";

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => {
    const dict = require("@/i18n/dictionaries").getDictionary(mockLocale);
    return {
      t: (key: string) => dict[key] ?? key,
      locale: mockLocale,
    };
  }),
  formatRelativeTime: jest.fn(() => "3m ago"),
}));

const mockGetUnreadCount = jest.fn();
const mockGetNotifications = jest.fn();
const mockMarkAllAsRead = jest.fn();
const mockMarkAsRead = jest.fn();
const mockDismissNotification = jest.fn();

jest.mock("@/actions/notification.actions", () => ({
  getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  markAllAsRead: (...args: unknown[]) => mockMarkAllAsRead(...args),
  markAsRead: (...args: unknown[]) => mockMarkAsRead(...args),
  dismissNotification: (...args: unknown[]) => mockDismissNotification(...args),
}));

// Mock lucide-react icons
jest.mock("lucide-react", () => ({
  Bell: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-bell" {...props} />
  ),
  CheckCheck: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-check-check" {...props} />
  ),
  Info: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-info" {...props} />
  ),
  AlertTriangle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-alert" {...props} />
  ),
  XCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-x-circle" {...props} />
  ),
  CheckCircle2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-check-circle" {...props} />
  ),
  Briefcase: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-briefcase" {...props} />
  ),
  Trash2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-trash" {...props} />
  ),
  X: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-x" {...props} />
  ),
}));

// Mock the media query hook — the bell renders Popover on desktop and
// Sheet on mobile. Default to desktop so Popover is exercised.
jest.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: jest.fn(() => true),
}));

// Mock Radix Popover to render inline (portals don't work in JSDOM)
jest.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Mock Radix Sheet (used on mobile) for completeness — if the default for
// useMediaQuery changes, the mobile branch should still render without errors.
jest.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

// Mock ScrollArea to render children directly
jest.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

import { NotificationBell } from "@/components/layout/NotificationBell";

describe("NotificationBell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUnreadCount.mockResolvedValue({ success: true, data: 0 });
    mockGetNotifications.mockResolvedValue({ success: true, data: [] });
  });

  it("renders the bell icon", async () => {
    await act(async () => {
      render(<NotificationBell />);
    });

    expect(screen.getByTestId("icon-bell")).toBeInTheDocument();
  });

  it("shows unread count badge when count > 0", async () => {
    mockGetUnreadCount.mockResolvedValue({ success: true, data: 5 });

    await act(async () => {
      render(<NotificationBell />);
    });

    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("hides badge when unread count is 0", async () => {
    mockGetUnreadCount.mockResolvedValue({ success: true, data: 0 });

    await act(async () => {
      render(<NotificationBell />);
    });

    // No count badge should be visible
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows 99+ when count exceeds 99", async () => {
    mockGetUnreadCount.mockResolvedValue({ success: true, data: 150 });

    await act(async () => {
      render(<NotificationBell />);
    });

    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("has accessible aria-label with count", async () => {
    mockGetUnreadCount.mockResolvedValue({ success: true, data: 3 });

    await act(async () => {
      render(<NotificationBell />);
    });

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute(
      "aria-label",
      expect.stringContaining("3"),
    );
  });

  // ---------------------------------------------------------------------------
  // Sprint 3 Stream H — M-Y-07: badge live region
  // ---------------------------------------------------------------------------

  describe("M-Y-07 — badge live region", () => {
    it("marks the visible badge as aria-hidden so AT only reads the live region", async () => {
      mockGetUnreadCount.mockResolvedValue({ success: true, data: 5 });

      await act(async () => {
        render(<NotificationBell />);
      });

      // The visible badge text node (e.g. "5") must live inside an
      // `aria-hidden="true"` wrapper. Otherwise screen readers would
      // announce the count twice — once from the button's aria-label
      // and once from the badge itself.
      const badgeText = screen.getByText("5");
      // Walk up until we find aria-hidden, or hit the document root.
      let el: HTMLElement | null = badgeText;
      let foundHidden = false;
      while (el && el !== document.body) {
        if (el.getAttribute("aria-hidden") === "true") {
          foundHidden = true;
          break;
        }
        el = el.parentElement;
      }
      expect(foundHidden).toBe(true);
    });

    it("renders a polite live region that is empty before any announcement", async () => {
      mockGetUnreadCount.mockResolvedValue({ success: true, data: 0 });

      await act(async () => {
        render(<NotificationBell />);
      });

      // The live region must exist (role="status" + aria-live="polite")
      // so AT has a single stable anchor for count announcements.
      // Before any increase it must be empty — no spurious
      // "0 notifications" on initial mount.
      const liveRegion = document.querySelector(
        '[role="status"][aria-live="polite"]',
      );
      expect(liveRegion).not.toBeNull();
      expect(liveRegion?.getAttribute("aria-atomic")).toBe("true");
      expect(liveRegion?.textContent?.trim() ?? "").toBe("");
    });

    it("announces the new count after a debounced increase", async () => {
      jest.useFakeTimers();
      try {
        // Start at 0; the first fetchCount call resolves to 1, which
        // IS an increase from the initial 0 → should eventually
        // announce after the 500ms debounce window.
        mockGetUnreadCount.mockResolvedValue({ success: true, data: 1 });

        await act(async () => {
          render(<NotificationBell />);
        });

        // Before the debounce timer elapses, nothing should be
        // announced yet.
        const liveRegion = document.querySelector(
          '[role="status"][aria-live="polite"]',
        ) as HTMLElement | null;
        expect(liveRegion).not.toBeNull();
        expect(liveRegion?.textContent?.trim() ?? "").toBe("");

        // Advance past the 500ms debounce + 20ms clear-microtask.
        await act(async () => {
          jest.advanceTimersByTime(600);
        });

        // The live region should now contain the announcement.
        await waitFor(() => {
          expect(liveRegion?.textContent ?? "").toContain("1");
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it("does not announce when the count decreases", async () => {
      jest.useFakeTimers();
      try {
        mockGetUnreadCount.mockResolvedValue({ success: true, data: 3 });

        const { rerender } = await act(async () => {
          return render(<NotificationBell />);
        });

        // Let the initial increase (0 → 3) announce so the baseline
        // settles.
        await act(async () => {
          jest.advanceTimersByTime(600);
        });

        const liveRegion = document.querySelector(
          '[role="status"][aria-live="polite"]',
        ) as HTMLElement | null;
        expect(liveRegion?.textContent ?? "").toContain("3");

        // Now simulate a decrease: 3 → 1. The mock returns 1 on the
        // next poll tick (30s interval).
        mockGetUnreadCount.mockResolvedValue({ success: true, data: 1 });
        await act(async () => {
          jest.advanceTimersByTime(30_000);
        });
        // Allow any debounce that WOULD have fired to elapse.
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });

        // The live region must NOT contain "1" — decreases don't
        // announce (the user already knows they marked something as
        // read). The baseline stays on the last announced value.
        // We assert the region either still says "3" or is empty,
        // but crucially does NOT say "1".
        expect(liveRegion?.textContent ?? "").not.toContain("1 ");
        // Keep the component mounted for jest's async cleanup.
        rerender(<NotificationBell />);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
