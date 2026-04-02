"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
    } catch (error) {
      console.debug("[SSE] Parse error:", error);
    }
  };

  // P-6: Handle server-initiated close (timeout) — reconnect immediately
  eventSource.addEventListener("close", () => {
    disconnectShared();
    if (listeners.size > 0) connectShared(); // immediate reconnect, no delay
  });

  eventSource.onerror = () => {
    isSharedConnected = false;
    eventSource.close();
    sharedEventSource = null;
    // Reconnect after 5s on error (network failure etc.)
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
// Use globalThis guard to prevent duplicate listeners on HMR
const gVis = globalThis as unknown as { __schedulerVisibilityRegistered?: boolean };
if (typeof document !== "undefined" && !gVis.__schedulerVisibilityRegistered) {
  gVis.__schedulerVisibilityRegistered = true;
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
  /**
   * SSE connection state. Planned for future diagnostics UI
   * (e.g., Settings > Connection Health, reconnection banner).
   *
   * Currently unused — no component consumes this value.
   * NOTE: Uses module-level `let` (not React state), so changes do NOT
   * trigger re-renders. Migrate to `useSyncExternalStore` when adding a
   * consumer component.
   */
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

  // P-2 perf fix: use ref for stable callback identity
  // Callbacks read from ref instead of closing over state,
  // so they don't change on every SSE update (prevents re-render cascades)
  const stateRef = useRef(state);
  stateRef.current = state;

  const isRunning =
    state !== null &&
    (state.phase === "running" || state.runningAutomations.length > 0);

  const isAutomationRunning = useCallback(
    (automationId: string) => {
      const s = stateRef.current;
      if (!s) return false;
      return s.runningAutomations.some(
        (r) => r.automationId === automationId,
      );
    },
    [],
  );

  const getQueuePosition = useCallback(
    (automationId: string): number | null => {
      const s = stateRef.current;
      if (!s) return null;
      const entry = s.pendingAutomations.find(
        (p) => p.automationId === automationId,
      );
      return entry?.position ?? null;
    },
    [],
  );

  const getModuleBusy = useCallback(
    (moduleId: string) => {
      const s = stateRef.current;
      if (!s) return [];
      return s.runningAutomations.filter((r) => r.moduleId === moduleId);
    },
    [],
  );

  const getActiveProgress = useCallback(
    (automationId: string): RunProgress | null => {
      const s = stateRef.current;
      if (!s?.runningProgress) return null;
      return s.runningProgress[automationId] ?? null;
    },
    [],
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
