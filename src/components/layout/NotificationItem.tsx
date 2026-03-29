"use client";

import {
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Briefcase,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations, formatRelativeTime } from "@/i18n";
import type { Notification, NotificationType } from "@/models/notification.model";

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

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDismiss,
}: NotificationItemProps) {
  const { locale } = useTranslations();

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
        <p className="mt-1 text-xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt, locale)}
        </p>
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
          aria-label="Dismiss"
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
