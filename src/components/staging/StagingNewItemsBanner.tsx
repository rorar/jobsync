"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { useSchedulerStatus } from "@/hooks/use-scheduler-status";

interface StagingNewItemsBannerProps {
  onRefresh: () => void;
}

/**
 * Notification banner that appears when the scheduler completes a cycle
 * (running -> idle transition), indicating new staged items may be available.
 *
 * Owns its own useSchedulerStatus subscription and phase-transition detection.
 */
export function StagingNewItemsBanner({ onRefresh }: StagingNewItemsBannerProps) {
  const { t } = useTranslations();
  const [newItemsAvailable, setNewItemsAvailable] = useState(false);

  // Track scheduler phase transitions to detect cycle completion
  const { state: schedulerState } = useSchedulerStatus();
  const prevPhaseRef = useRef<string | null>(null);
  const schedulerPhase = useMemo(
    () => schedulerState?.phase ?? null,
    [schedulerState],
  );

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = schedulerPhase;

    // Detect transition from running to idle (cycle completed)
    if (
      prevPhase !== null &&
      prevPhase === "running" &&
      schedulerPhase === "idle"
    ) {
      setNewItemsAvailable(true);
    }
  }, [schedulerPhase]);

  if (!newItemsAvailable) return null;

  return (
    <div role="status" className="flex items-center justify-between p-3 mb-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
      <span className="text-sm">{t("automations.newItemsAvailable")}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          onRefresh();
          setNewItemsAvailable(false);
        }}
      >
        {t("automations.showNewItems")}
      </Button>
    </div>
  );
}
