export type NotificationType =
  | "module_deactivated"
  | "module_reactivated"
  | "module_unreachable"
  | "cb_escalation"
  | "consecutive_failures"
  | "auth_failure";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  moduleId: string | null;
  automationId: string | null;
  read: boolean;
  createdAt: Date;
}
