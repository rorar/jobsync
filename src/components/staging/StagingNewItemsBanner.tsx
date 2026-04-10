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

  // L-Y-02 (Sprint 4 Stream E) — previously the whole banner (announcement
  // text + Button) lived inside a single `role="status"` live region. Screen
  // readers re-read the entire live region on every change, which meant the
  // "Show new items" button's label was re-announced alongside the status
  // text every time the polite region updated. WCAG 4.1.3 says a status
  // message region SHOULD only contain the message — interactive controls
  // confuse the announcement (NVDA/JAWS tend to swallow the button label,
  // VoiceOver repeats both on each update).
  //
  // Fix: split the banner into a status-message region (sr-announced) and
  // a sibling non-live action container. The visual layout is unchanged;
  // only the ARIA surface is split so the button no longer sits inside a
  // live region. The visible text is duplicated in the sr-only status
  // region AND the visible span so sighted users keep seeing the label.
  return (
    <div className="flex items-center justify-between p-3 mb-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
      <span className="text-sm" aria-hidden="true">
        {t("automations.newItemsAvailable")}
      </span>
      {/* Live-region-only wrapper — sr-only to avoid a visible duplicate */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {t("automations.newItemsAvailable")}
      </div>
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
