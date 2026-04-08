"use client";

import {
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Briefcase,
  ExternalLink,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations, formatRelativeTime } from "@/i18n";
import type { Notification, NotificationType } from "@/models/notification.model";
import Link from "next/link";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case "auth_failure":
    case "module_unreachable":
      return <XCircle className="h-4 w-4 text-destructive" />;
    case "cb_escalation":
    case "consecutive_failures":
    case "module_deactivated":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "module_reactivated":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "vacancy_promoted":
      return <Briefcase className="h-4 w-4 text-primary" />;
    case "bulk_action_completed":
    case "retention_completed":
      return <CheckCircle2 className="h-4 w-4 text-primary" />;
    case "vacancy_batch_staged":
      return <Info className="h-4 w-4 text-blue-500" />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

/**
 * Safely parse the notification data field.
 * Prisma Json fields come back as objects, but guard against string serialization.
 */
function parseNotificationData(
  data: unknown,
): Record<string, unknown> | null {
  if (!data) return null;
  if (typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (e) {
      console.warn("[parseNotificationData] Failed to parse notification data:", data, e);
    }
  }
  return null;
}

/**
 * Derive a contextual link from notification type and data.
 * Returns href + i18n label key, or null if no link is applicable.
 */
function getNotificationLink(
  notification: Notification,
): { href: string; labelKey: string } | null {
  // vacancy_promoted -> link to the created job
  if (notification.type === "vacancy_promoted") {
    const data = parseNotificationData(notification.data);
    const jobId = data?.jobId;
    if (typeof jobId === "string" && jobId) {
      return { href: `/dashboard/myjobs/${jobId}`, labelKey: "notifications.viewJob" };
    }
  }

  // Fallback: automation link (arrow only, no label key)
  if (notification.automationId) {
    return {
      href: `/dashboard/automations/${notification.automationId}`,
      labelKey: "",
    };
  }

  return null;
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDismiss,
}: NotificationItemProps) {
  const { t, locale } = useTranslations();
  const link = getNotificationLink(notification);

  const handleClick = () => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
  };

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer",
        !notification.read && "bg-muted/30",
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="mt-0.5 flex-shrink-0">
        {getNotificationIcon(notification.type as NotificationType)}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm leading-snug",
            !notification.read ? "font-medium" : "text-muted-foreground",
          )}
        >
          {notification.message}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatRelativeTime(notification.createdAt, locale)}</span>
          {link && !link.labelKey && (
            <Link
              href={link.href}
              className="text-xs text-muted-foreground hover:underline hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              →
            </Link>
          )}
        </div>
        {link && link.labelKey && (
          <Link
            href={link.href}
            className="mt-1 text-sm text-primary hover:underline inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {t(link.labelKey)}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(notification.id);
          }}
          aria-label={t("notifications.dismiss")}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      {!notification.read && (
        <div className="mt-2 flex-shrink-0">
          <div className="h-2 w-2 rounded-full bg-primary" />
        </div>
      )}
    </div>
  );
}
