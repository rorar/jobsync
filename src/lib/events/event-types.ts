/**
 * Domain Event Types — Discriminated Union
 *
 * Every domain event carries a `type` discriminant and a typed `payload`.
 * Consumers subscribe to specific types and receive narrowed payloads.
 *
 * Spec: specs/event-bus.allium (value DomainEvent, typed payloads)
 */

// ---------------------------------------------------------------------------
// Event Type Enum
// ---------------------------------------------------------------------------

export const DomainEventType = {
  VacancyPromoted: "VacancyPromoted",
  VacancyDismissed: "VacancyDismissed",
  VacancyStaged: "VacancyStaged",
  VacancyArchived: "VacancyArchived",
  VacancyTrashed: "VacancyTrashed",
  VacancyRestoredFromTrash: "VacancyRestoredFromTrash",
  BulkActionCompleted: "BulkActionCompleted",
  ModuleDeactivated: "ModuleDeactivated",
  ModuleReactivated: "ModuleReactivated",
  RetentionCompleted: "RetentionCompleted",
  NotificationCreated: "NotificationCreated",
} as const;

export type DomainEventType = (typeof DomainEventType)[keyof typeof DomainEventType];

// ---------------------------------------------------------------------------
// Typed Payloads
// ---------------------------------------------------------------------------

export interface VacancyPromotedPayload {
  stagedVacancyId: string;
  jobId: string;
  userId: string;
}

export interface VacancyDismissedPayload {
  stagedVacancyId: string;
  userId: string;
}

export interface VacancyStagedPayload {
  stagedVacancyId: string;
  userId: string;
  sourceBoard: string;
  automationId: string | null;
}

export interface VacancyArchivedPayload {
  stagedVacancyId: string;
  userId: string;
}

export interface VacancyTrashedPayload {
  stagedVacancyId: string;
  userId: string;
}

export interface VacancyRestoredFromTrashPayload {
  stagedVacancyId: string;
  userId: string;
}

export interface BulkActionCompletedPayload {
  actionType: string;
  itemIds: string[];
  userId: string;
  succeeded: number;
  failed: number;
}

export interface ModuleDeactivatedPayload {
  moduleId: string;
  userId: string;
  affectedAutomationIds: string[];
}

export interface ModuleReactivatedPayload {
  moduleId: string;
  userId: string;
  pausedAutomationCount: number;
}

export interface RetentionCompletedPayload {
  userId: string;
  purgedCount: number;
  hashesCreated: number;
}

export interface NotificationCreatedPayload {
  notificationId: string;
  userId: string;
  notificationType: string;
}

// ---------------------------------------------------------------------------
// Payload Map (type → payload shape)
// ---------------------------------------------------------------------------

export interface EventPayloadMap {
  VacancyPromoted: VacancyPromotedPayload;
  VacancyDismissed: VacancyDismissedPayload;
  VacancyStaged: VacancyStagedPayload;
  VacancyArchived: VacancyArchivedPayload;
  VacancyTrashed: VacancyTrashedPayload;
  VacancyRestoredFromTrash: VacancyRestoredFromTrashPayload;
  BulkActionCompleted: BulkActionCompletedPayload;
  ModuleDeactivated: ModuleDeactivatedPayload;
  ModuleReactivated: ModuleReactivatedPayload;
  RetentionCompleted: RetentionCompletedPayload;
  NotificationCreated: NotificationCreatedPayload;
}

// ---------------------------------------------------------------------------
// Domain Event (discriminated union base)
// ---------------------------------------------------------------------------

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
  readonly type: T;
  readonly timestamp: Date;
  readonly payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Handler Types
// ---------------------------------------------------------------------------

export type EventHandler<T extends DomainEventType = DomainEventType> = (
  event: DomainEvent<T>,
) => void | Promise<void>;

export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Convenience: typed event constructors
// ---------------------------------------------------------------------------

export function createEvent<T extends DomainEventType>(
  type: T,
  payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : Record<string, unknown>,
): DomainEvent<T> {
  return Object.freeze({ type, timestamp: new Date(), payload });
}
