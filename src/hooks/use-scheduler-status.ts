"use client";

import { useState, useEffect, useCallback } from "react";
import type { SchedulerSnapshot, RunProgress } from "@/lib/scheduler/types";

/**
 * Client hook for real-time scheduler state via SSE.
 *
 * Uses a SHARED singleton EventSource — all hook instances in all components
 * share one SSE connection per browser tab (M-2 fix).
 * Pauses SSE when no consumers are mounted or tab is hidden.
 * Auto-reconnects on connection loss.
 *
 * Spec: scheduler-coordination.allium (surface SchedulerStatusBar)
 */

// ---------------------------------------------------------------------------
// Shared singleton state (module-level — one per browser tab)
// ---------------------------------------------------------------------------

type Listener = (state: SchedulerSnapshot | null) => void;

const listeners = new Set<Listener>();
let sharedState: SchedulerSnapshot | null = null;
let sharedEventSource: EventSource | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let isSharedConnected = false;

function notifyListeners() {
  for (const listener of listeners) {
    listener(sharedState);
  }
}

function connectShared() {
  if (typeof window === "undefined") return;
  if (document.hidden) return;
  if (sharedEventSource) return; // already connected

  const eventSource = new EventSource("/api/scheduler/status");
  sharedEventSource = eventSource;

  eventSource.onopen = () => {
    isSharedConnected = true;
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if ("error" in data) return;
      sharedState = data as SchedulerSnapshot;
      notifyListeners();
    } catch {
      // Ignore parse errors
    }
  };

  eventSource.onerror = () => {
    isSharedConnected = false;
    eventSource.close();
    sharedEventSource = null;
    // Reconnect after 5s if there are still listeners
    if (listeners.size > 0) {
      reconnectTimeout = setTimeout(connectShared, 5000);
    }
  };
}

function disconnectShared() {
  if (sharedEventSource) {
    sharedEventSource.close();
    sharedEventSource = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  isSharedConnected = false;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  // First consumer → open connection
  if (listeners.size === 1) {
    connectShared();
  }
  return () => {
    listeners.delete(listener);
    // Last consumer unmounted → close connection
    if (listeners.size === 0) {
      disconnectShared();
    }
  };
}

// Tab visibility: pause/resume shared connection
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      disconnectShared();
    } else if (listeners.size > 0) {
      connectShared();
    }
  });
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

interface UseSchedulerStatusResult {
  isConnected: boolean;
  state: SchedulerSnapshot | null;
  isRunning: boolean;
  isAutomationRunning: (automationId: string) => boolean;
  getQueuePosition: (automationId: string) => number | null;
  getModuleBusy: (moduleId: string) => SchedulerSnapshot["runningAutomations"];
  getActiveProgress: (automationId: string) => RunProgress | null;
}

export function useSchedulerStatus(): UseSchedulerStatusResult {
  const [state, setState] = useState<SchedulerSnapshot | null>(sharedState);

  useEffect(() => {
    return subscribe(setState);
  }, []);

  const isRunning =
    state !== null &&
    (state.phase === "running" || state.runningAutomations.length > 0);

  const isAutomationRunning = useCallback(
    (automationId: string) => {
      if (!state) return false;
      return state.runningAutomations.some(
        (r) => r.automationId === automationId,
      );
    },
    [state],
  );

  const getQueuePosition = useCallback(
    (automationId: string): number | null => {
      if (!state) return null;
      const entry = state.pendingAutomations.find(
        (p) => p.automationId === automationId,
      );
      return entry?.position ?? null;
    },
    [state],
  );

  const getModuleBusy = useCallback(
    (moduleId: string) => {
      if (!state) return [];
      return state.runningAutomations.filter((r) => r.moduleId === moduleId);
    },
    [state],
  );

  const getActiveProgress = useCallback(
    (automationId: string): RunProgress | null => {
      if (!state?.runningProgress) return null;
      return state.runningProgress[automationId] ?? null;
    },
    [state],
  );

  return {
    isConnected: isSharedConnected,
    state,
    isRunning,
    isAutomationRunning,
    getQueuePosition,
    getModuleBusy,
    getActiveProgress,
  };
}
