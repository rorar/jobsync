import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { createSlidingWindowLimiter } from "@/lib/rate-limit";
import { runCoordinator } from "@/lib/scheduler/run-coordinator";
import type { RunRequestResult } from "@/lib/scheduler/types";
import type { AutomationPauseReason, AutomationStatus, JobBoard } from "@/models/automation.model";

const MAX_RUNS_PER_HOUR = 5;

const manualRunLimiter = createSlidingWindowLimiter({
  storeKey: "manualRunRateLimit",
  maxRequests: MAX_RUNS_PER_HOUR,
  windowMs: 60 * 60 * 1000, // 1 hour
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!session || !userId) {
    return NextResponse.json({ message: "Not Authenticated" }, { status: 401 });
  }

  const { id: automationId } = await params;

  if (!manualRunLimiter.check(userId).allowed) {
    return NextResponse.json(
      { message: `Rate limit exceeded. Maximum ${MAX_RUNS_PER_HOUR} manual runs per hour.` },
      { status: 429 }
    );
  }

  try {
    const automation = await db.automation.findFirst({
      where: {
        id: automationId,
        userId,
      },
      include: {
        resume: true,
      },
    });

    if (!automation) {
      return NextResponse.json({ message: "Automation not found" }, { status: 404 });
    }

    if (!automation.resume) {
      return NextResponse.json(
        { message: "Resume is missing. Please edit the automation and select a resume." },
        { status: 400 }
      );
    }

    const requestResult: RunRequestResult =
      await runCoordinator.requestRun(
        {
          id: automation.id,
          userId: automation.userId,
          name: automation.name,
          jobBoard: automation.jobBoard as JobBoard,
          keywords: automation.keywords,
          location: automation.location,
          connectorParams: automation.connectorParams ?? null,
          resumeId: automation.resumeId,
          matchThreshold: automation.matchThreshold,
          scheduleHour: automation.scheduleHour,
          scheduleFrequency: automation.scheduleFrequency,
          nextRunAt: automation.nextRunAt,
          lastRunAt: automation.lastRunAt,
          status: automation.status as AutomationStatus,
          pauseReason: (automation.pauseReason as AutomationPauseReason) ?? null,
          createdAt: automation.createdAt,
          updatedAt: automation.updatedAt,
        },
        { runSource: "manual" },
      );

    if (requestResult.status === "already_running") {
      return NextResponse.json(
        {
          success: false,
          message: "This automation is already running",
          existingRunSource: requestResult.existingRunSource,
          existingStartedAt: requestResult.existingStartedAt,
        },
        { status: 409 },
      );
    }

    const result = requestResult.runnerResult;
    if (result) {
      return NextResponse.json({
        success: true,
        run: {
          id: result.runId,
          status: result.status,
          jobsSearched: result.jobsSearched,
          jobsDeduplicated: result.jobsDeduplicated,
          jobsProcessed: result.jobsProcessed,
          jobsMatched: result.jobsMatched,
          jobsSaved: result.jobsSaved,
          errorMessage: result.errorMessage,
          blockedReason: result.blockedReason,
        },
      });
    }

    // Fallback: coordinator returned acquired but no runner result
    return NextResponse.json({
      success: true,
      run: { id: requestResult.runId, status: "completed" },
    });
  } catch (error) {
    console.error("Manual run error:", error);
    // S-F7: Don't leak internal error details to client
    return NextResponse.json({ success: false, message: "Run failed" }, { status: 500 });
  }
}
