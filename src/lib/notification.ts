import "server-only";

import prisma from "@/lib/db";

/**
 * Create a notification record in the database.
 * Internal server-only function called by degradation rules and module actions.
 * Not a server action — cannot be invoked from the client.
 */
export async function createNotification(params: {
  userId: string;
  type: string;
  message: string;
  moduleId?: string;
  automationId?: string;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      message: params.message,
      moduleId: params.moduleId ?? null,
      automationId: params.automationId ?? null,
    },
  });
}
