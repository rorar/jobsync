"use client";

import { useCallback, useState } from "react";
import type { AutomationWithResume } from "@/models/automation.model";
import type { SchedulerSnapshot, RunLock } from "@/lib/scheduler/types";

export interface ConflictDetails {
  automationName?: string;
  runSource?: string;
  startedAt?: Date;
  moduleId?: string;
  otherAutomations?: string[];
}

interface UseConflictDetectionReturn {
  conflictOpen: boolean;
  conflictType: "blocked" | "contention";
  conflictDetails: ConflictDetails;
  setConflictOpen: (open: boolean) => void;
  /** Returns true if a conflict was found (dialog opened), false if clear to proceed */
  checkConflict: () => boolean;
}

/**
 * Encapsulates the pre-check logic before "Run Now":
 * - Checks if the automation is already running (blocked)
 * - Checks if another automation is using the same module (contention)
 *
 * If a conflict is detected, it opens the ConflictWarningDialog with details.
 */
export function useConflictDetection(
  automation: AutomationWithResume | null,
  schedulerState: SchedulerSnapshot | null,
  isAutomationRunning: (id: string) => boolean,
  getModuleBusy: (moduleId: string) => RunLock[],
): UseConflictDetectionReturn {
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictType, setConflictType] = useState<"blocked" | "contention">("blocked");
  const [conflictDetails, setConflictDetails] = useState<ConflictDetails>({});

  const checkConflict = useCallback((): boolean => {
    if (!automation) return false;

    // Check if this automation is already running
    if (isAutomationRunning(automation.id)) {
      const lock = schedulerState?.runningAutomations.find(
        (r) => r.automationId === automation.id
      );
      setConflictType("blocked");
      setConflictDetails({
        automationName: automation.name,
        runSource: lock?.runSource,
        startedAt: lock?.startedAt ? new Date(lock.startedAt) : undefined,
      });
      setConflictOpen(true);
      return true;
    }

    // Check if another automation is using the same module
    const moduleBusy = getModuleBusy(automation.jobBoard).filter(
      (l) => l.automationId !== automation.id
    );
    if (moduleBusy.length > 0) {
      setConflictType("contention");
      setConflictDetails({
        moduleId: automation.jobBoard,
        otherAutomations: moduleBusy.map((l) => l.automationName),
      });
      setConflictOpen(true);
      return true;
    }

    return false;
  }, [automation, schedulerState, isAutomationRunning, getModuleBusy]);

  return {
    conflictOpen,
    conflictType,
    conflictDetails,
    setConflictOpen,
    checkConflict,
  };
}
