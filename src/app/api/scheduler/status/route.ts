import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runCoordinator } from "@/lib/scheduler/run-coordinator";

/**
 * SSE endpoint for real-time scheduler state.
 * Polls RunCoordinator.getState() every 2 seconds.
 * Auth-gated, auto-closes after 10 minutes.
 *
 * Spec: scheduler-coordination.allium (surface SchedulerStatusBar)
 * Pattern: Based on /api/automations/[id]/logs/route.ts
 */

function createSSEErrorResponse(message: string): NextResponse {
  const encoder = new TextEncoder();
  const errorData = JSON.stringify({ error: message });
  const body = encoder.encode(`data: ${errorData}\n\n`);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return createSSEErrorResponse("Not Authenticated");
  }

  const encoder = new TextEncoder();
  const SSE_POLL_INTERVAL_MS = 2000;
  const SSE_MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes

  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(interval);
        clearTimeout(timeout);
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      };

      // Filter state to current user's automations only (M-1 security fix)
      const userId = session.user!.id!;
      const filterStateForUser = () => {
        const fullState = runCoordinator.getState();
        const userRunningAutomations = fullState.runningAutomations.filter(
          (r) => r.userId === userId,
        );
        return {
          ...fullState,
          runningAutomations: userRunningAutomations,
          // Filter pending automations by userId (RunQueuePosition now carries userId)
          pendingAutomations: fullState.pendingAutomations.filter(
            (p) => p.userId === userId,
          ),
          // Filter progress to user's automations only
          runningProgress: Object.fromEntries(
            Object.entries(fullState.runningProgress).filter(([id]) =>
              userRunningAutomations.some((r) => r.automationId === id)
            )
          ),
        };
      };

      // Send initial state immediately
      const initialState = filterStateForUser();
      let lastSentJson = JSON.stringify(initialState);
      controller.enqueue(
        encoder.encode(`data: ${lastSentJson}\n\n`),
      );

      // Poll for state changes every 2 seconds, skip if unchanged
      const interval = setInterval(() => {
        if (isClosed) return;
        try {
          const state = filterStateForUser();
          const json = JSON.stringify(state);
          if (json === lastSentJson) return; // skip if unchanged
          lastSentJson = json;
          controller.enqueue(
            encoder.encode(`data: ${json}\n\n`),
          );
        } catch {
          cleanup();
        }
      }, SSE_POLL_INTERVAL_MS);

      // Cleanup on client disconnect
      req.signal.addEventListener("abort", cleanup);

      // Auto-close after 10 minutes
      const timeout = setTimeout(cleanup, SSE_MAX_DURATION_MS);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
