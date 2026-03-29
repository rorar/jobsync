export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();

    const { startHealthScheduler } = await import(
      "@/lib/connector/health-scheduler"
    );
    startHealthScheduler();
  }
}
