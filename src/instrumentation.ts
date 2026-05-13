export async function register() {
  // Startup environment validation (G26)
  if (!process.env.ENCRYPTION_KEY) {
    console.error("[FATAL] ENCRYPTION_KEY environment variable is not set. Cannot start.");
    throw new Error("ENCRYPTION_KEY is required");
  }
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
    console.error("[FATAL] AUTH_SECRET environment variable is not set in production. Cannot start.");
    throw new Error("AUTH_SECRET is required in production");
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Event Bus consumers must register before any events are published
    const { registerEventConsumers } = await import("@/lib/events/consumers");
    registerEventConsumers();

    // Reconcile orphaned "running" AutomationRuns from prior crashes
    // (Ghost Lock Prevention — scheduler-coordination.allium)
    const { reconcileOrphanedRuns } = await import("@/lib/scheduler/run-coordinator");
    await reconcileOrphanedRuns();

    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();

    const { startHealthScheduler } = await import(
      "@/lib/connector/health-scheduler"
    );
    startHealthScheduler();

    const { startCrmCron } = await import("@/lib/scheduler/crm-cron");
    startCrmCron();

    const { startRetentionCron } = await import("@/lib/scheduler/retention-cron");
    startRetentionCron();
  }
}
