"use client";

import { useRouter } from "next/navigation";
import { SuperLikeCelebration } from "./SuperLikeCelebration";
import type { CelebrationItem } from "@/hooks/useSuperLikeCelebrations";

/**
 * Host that mounts the active super-like celebration card.
 *
 * The host is intentionally a thin wrapper: it owns the navigation side
 * effect (`router.push`) and the fixed-position viewport wrapper, while the
 * `SuperLikeCelebration` component owns the visual / animation / dismiss
 * behavior.
 *
 * Stacking semantics (FIFO, max 5) live in `useSuperLikeCelebrations`. This
 * component renders only the head of the queue (`current`).
 *
 * TODO(Phase 3+): Insert a 1500ms grace period between consecutive
 * celebrations so a rapidly-replaced card briefly fades out before the next
 * one slides up. For v1 we replace immediately — keeping scope tight.
 */
export interface SuperLikeCelebrationHostProps {
  /** The celebration that should be visible right now (or `null` for nothing). */
  current: CelebrationItem | null;
  /** Number of celebrations queued behind `current` (drives the "+N more" badge). */
  queueRemaining: number;
  /** Dismiss callback wired from `useSuperLikeCelebrations`. */
  dismiss: (id: string) => void;
}

export function SuperLikeCelebrationHost({
  current,
  queueRemaining,
  dismiss,
}: SuperLikeCelebrationHostProps) {
  const router = useRouter();

  if (!current) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none"
      style={{
        // iOS safe-area aware bottom offset (consultation §1).
        paddingBottom: "max(env(safe-area-inset-bottom, 0px) + 16px, 24px)",
      }}
    >
      <SuperLikeCelebration
        id={current.id}
        jobId={current.jobId}
        vacancyTitle={current.vacancyTitle}
        queueRemaining={queueRemaining}
        onDismiss={dismiss}
        onOpenJob={(jobId) => {
          // Dismiss before navigating so the card does not flash on the next
          // route while React tears down. Navigation happens via the App
          // Router for client-side prefetch / transitions.
          dismiss(current.id);
          router.push(`/dashboard/myjobs/${jobId}`);
        }}
      />
    </div>
  );
}
