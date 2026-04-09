/**
 * NotificationBell Component Tests
 *
 * Tests: unread count badge visibility, polling behavior
 * Spec: specs/notification-dispatch.allium (surface NotificationBell)
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, act } from "@testing-library/react";

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
});
