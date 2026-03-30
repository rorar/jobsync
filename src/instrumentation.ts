export async function register() {
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
  }
}
