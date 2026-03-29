export interface DomainEvent<T extends string = string> {
  type: T;
  timestamp: Date;
  payload: Record<string, unknown>;
}

export interface VacancyPromotedEvent extends DomainEvent<"VacancyPromoted"> {
  payload: {
    stagedVacancyId: string;
    jobId: string;
    userId: string;
  };
}

export interface VacancyDismissedEvent extends DomainEvent<"VacancyDismissed"> {
  payload: {
    stagedVacancyId: string;
    userId: string;
  };
}

export interface VacancyStagedEvent extends DomainEvent<"VacancyStaged"> {
  payload: {
    stagedVacancyId: string;
    userId: string;
    sourceBoard: string;
    automationId: string;
  };
}

export interface BulkActionCompletedEvent extends DomainEvent<"BulkActionCompleted"> {
  payload: {
    actionType: string;
    itemIds: string[];
    userId: string;
    succeeded: number;
    failed: number;
  };
}

/** Stub: log only. ROADMAP 0.6 Event Bus will replace this. */
export function emitEvent(event: DomainEvent): void {
  console.debug(`[DomainEvent] ${event.type}`, event.payload);
}
