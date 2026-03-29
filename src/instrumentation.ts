export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Event Bus consumers must register before any events are published
    const { registerEventConsumers } = await import("@/lib/events/consumers");
    registerEventConsumers();

    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();

    const { startHealthScheduler } = await import(
      "@/lib/connector/health-scheduler"
    );
    startHealthScheduler();
  }
}
