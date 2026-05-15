/**
 * Test helper: mock NotificationChannel factory.
 *
 * Moved from src/lib/data/testFixtures.ts (BP-3: jest.fn in production tree).
 * Only imported by test files — never bundled in production.
 */

import type {
  NotificationChannel,
  NotificationDraft,
  ChannelResult,
} from "@/lib/notifications/types";
import type { DispatchContext } from "@/lib/notifications/dispatch-context";

export function makeMockChannel(
  name: string,
  overrides: Partial<{ dispatch: jest.Mock }> = {},
): NotificationChannel & { dispatch: jest.Mock } {
  return {
    name,
    dispatch:
      overrides.dispatch ??
      jest
        .fn<Promise<ChannelResult>, [NotificationDraft, DispatchContext]>()
        .mockResolvedValue({ success: true, channel: name }),
  };
}
