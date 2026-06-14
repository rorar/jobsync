// Automation types and interfaces

import type { RunSource } from "@/lib/scheduler/types";
export type { RunSource };
export type AutomationStatus = "active" | "paused";
export type AutomationPauseReason =
  | "module_deactivated"
  | "auth_failure"
  | "consecutive_failures"
  | "cb_escalation";
export type AutomationRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "completed_with_errors"
  | "blocked"
  | "rate_limited";
export type DiscoveryStatus = "new" | "accepted" | "dismissed";
export type JobBoard = string;

export interface Automation {
  id: string;
  userId: string;
  name: string;
  jobBoard: JobBoard;
  keywords: string;
  location: string;
  connectorParams: string | null;
  resumeId: string;
  matchThreshold: number;
  scheduleHour: number;
  scheduleFrequency: string;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  status: AutomationStatus;
  pauseReason: AutomationPauseReason | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutomationWithResume extends Automation {
  resume: {
    id: string;
    title: string;
  };
}

export interface AutomationRun {
  id: string;
  automationId: string;
  jobsSearched: number;
  jobsDeduplicated: number;
  jobsProcessed: number;
  jobsMatched: number;
  jobsSaved: number;
  status: AutomationRunStatus;
  errorMessage: string | null;
  blockedReason: string | null;
  startedAt: Date;
  completedAt: Date | null;
  runSource: RunSource;
}

