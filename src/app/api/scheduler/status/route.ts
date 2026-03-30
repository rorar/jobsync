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
        return {
          ...fullState,
          runningAutomations: fullState.runningAutomations.filter(
            (r) => r.userId === userId,
          ),
          pendingAutomations: fullState.pendingAutomations.filter((p) => {
            const lock = fullState.runningAutomations.find(
              (r) => r.automationId === p.automationId,
            );
            return !lock || lock.userId === userId;
          }),
        };
      };

      // Send initial state immediately
      const initialState = filterStateForUser();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initialState)}\n\n`),
      );

      // Poll for state changes every 2 seconds
      const interval = setInterval(() => {
        if (isClosed) return;
        try {
          const state = filterStateForUser();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(state)}\n\n`),
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
