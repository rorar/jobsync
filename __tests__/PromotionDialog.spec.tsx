/**
 * PromotionDialog tests — CRIT-A2 regression coverage
 *
 * These tests guard the ADR-030 Decision A contract: after a successful
 * `promoteStagedVacancyToJob` server action, the dialog MUST forward the
 * created Job's id to the caller via `onSuccess({ jobId, stagedVacancyId })`.
 * The pre-fix behaviour passed no arguments, causing the super-like
 * celebration fly-in to be silently dropped in the default (auto-approve=OFF)
 * deck flow because `promotionResolveRef` resolved with
 * `{ success: true }` — no `createdJobId`.
 *
 * Scope:
 *   1. `onSuccess` is invoked with `{ jobId, stagedVacancyId }` when the
 *      server action returns a populated `ActionResult.data`.
 *   2. The full chain — PromotionDialog.onSuccess → a caller-provided
 *      `promotionResolveRef`-style ref — resolves with
 *      `{ success: true, createdJobId }`. This mirrors the
 *      StagingContainer wiring at lines ~605-612 and catches any future
 *      regression that drops the jobId between dialog and ref.
 *   3. `onSuccess` is NOT invoked when the server action fails, and an
 *      error toast is shown instead.
 *
 * Stream: Sprint 1 CRIT-A2
 * Related files:
 *   - src/components/staging/PromotionDialog.tsx
 *   - src/components/staging/StagingContainer.tsx (promotionResolveRef)
 *   - src/hooks/useDeckStack.ts (onSuperLikeSuccess forwarding)
 *   - docs/adr/030-deck-action-contract-and-notification-late-binding.md
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { PromotionDialog } from "@/components/staging/PromotionDialog";
import { mockStagedVacancy } from "@/lib/data/testFixtures";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the server action so we can control its return shape and assert
// exactly what PromotionDialog destructures and forwards.
jest.mock("@/actions/stagedVacancy.actions", () => ({
  promoteStagedVacancyToJob: jest.fn(),
}));

// Suppress toast side-effects in tests.
jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

// Pass-through i18n — use the dictionary key as the display text.
jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    t: (key: string) => key,
    locale: "en",
  }),
}));

import { promoteStagedVacancyToJob } from "@/actions/stagedVacancy.actions";
import { toast } from "@/components/ui/use-toast";

const promoteMock = promoteStagedVacancyToJob as jest.MockedFunction<
  typeof promoteStagedVacancyToJob
>;
const toastMock = toast as jest.MockedFunction<typeof toast>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const vacancy: StagedVacancyWithAutomation = {
  ...mockStagedVacancy,
  automation: { id: "automation-1", name: "Test automation" },
};

function renderDialog(overrides: {
  onOpenChange?: (open: boolean) => void;
  onSuccess?: (result: { jobId: string; stagedVacancyId: string }) => void;
} = {}) {
  const onOpenChange = overrides.onOpenChange ?? jest.fn();
  const onSuccess = overrides.onSuccess ?? jest.fn();
  render(
    <PromotionDialog
      open={true}
      onOpenChange={onOpenChange}
      vacancy={vacancy}
      onSuccess={onSuccess}
    />,
  );
  return { onOpenChange, onSuccess };
}

function clickPromote() {
  // The Promote button is the non-Cancel footer button — `staging.promote` is
  // the only label present from the i18n passthrough that maps to it.
  const promoteBtn = screen.getByRole("button", { name: "staging.promote" });
  fireEvent.click(promoteBtn);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("PromotionDialog — CRIT-A2 jobId threading", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("invokes onSuccess with { jobId, stagedVacancyId } when the server action returns data", async () => {
    promoteMock.mockResolvedValue({
      success: true,
      data: { jobId: "job-abc-123", stagedVacancyId: vacancy.id },
    });

    const { onSuccess, onOpenChange } = renderDialog();

    await act(async () => {
      clickPromote();
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(onSuccess).toHaveBeenCalledWith({
      jobId: "job-abc-123",
      stagedVacancyId: vacancy.id,
    });

    // Dialog must also request to close on success.
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Success toast was fired.
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success" }),
    );
  });

  it("threads the jobId through a promotionResolveRef-style caller (full chain)", async () => {
    // This is the critical regression test: it mirrors the
    // StagingContainer.promotionResolveRef wiring. Before CRIT-A2 the ref
    // resolved with `{ success: true }` (no createdJobId) because the
    // onSuccess callback was parameterless. If anyone drops the jobId between
    // the dialog and the ref again, this test fails loudly.
    promoteMock.mockResolvedValue({
      success: true,
      data: { jobId: "job-xyz-999", stagedVacancyId: vacancy.id },
    });

    // Mirror StagingContainer's ref-based resolver.
    const promotionResolveRef: {
      current: ((result: { success: boolean; createdJobId?: string }) => void) | null;
    } = { current: null };

    const resolvedWith = new Promise<{
      success: boolean;
      createdJobId?: string;
    }>((resolve) => {
      promotionResolveRef.current = resolve;
    });

    // This matches StagingContainer.tsx's onSuccess callback verbatim.
    const onSuccess = (result: { jobId: string; stagedVacancyId: string }) => {
      if (promotionResolveRef.current) {
        promotionResolveRef.current({
          success: true,
          createdJobId: result.jobId,
        });
        promotionResolveRef.current = null;
      }
    };

    renderDialog({ onSuccess });

    await act(async () => {
      clickPromote();
    });

    const resolved = await resolvedWith;
    expect(resolved).toEqual({
      success: true,
      createdJobId: "job-xyz-999",
    });
  });

  it("preserves jobId when StagingContainer's onOpenChange microtask races with onSuccess", async () => {
    // Mirrors the real race condition in StagingContainer.tsx:
    //   - PromotionDialog.handlePromote calls `onOpenChange(false)` BEFORE
    //     it calls `onSuccess(...)`.
    //   - The container's onOpenChange handler schedules a
    //     `queueMicrotask(() => resolveRef({ success: false }))` cleanup.
    //   - Then onSuccess fires synchronously and resolves the ref with
    //     `{ success: true, createdJobId }` + nulls the ref.
    //   - When the queued microtask runs, it must see the null and no-op.
    //
    // If the ordering ever flips (e.g. someone re-orders the dialog to call
    // onSuccess before onOpenChange), the ref would be overwritten with
    // `{ success: false }` and the deck card would roll back instead of
    // advancing. This test pins the ordering.
    promoteMock.mockResolvedValue({
      success: true,
      data: { jobId: "job-race-777", stagedVacancyId: vacancy.id },
    });

    const promotionResolveRef: {
      current: ((result: { success: boolean; createdJobId?: string }) => void) | null;
    } = { current: null };

    let settledValue: { success: boolean; createdJobId?: string } | null = null;
    const resolvedWith = new Promise<{
      success: boolean;
      createdJobId?: string;
    }>((resolve) => {
      promotionResolveRef.current = (result) => {
        // Capture only the FIRST resolution — downstream microtask attempts
        // to resolve again are expected to be no-ops (ref is nulled after
        // the first resolve, matching StagingContainer's guard).
        if (settledValue === null) {
          settledValue = result;
          resolve(result);
        }
      };
    });

    // Verbatim copy of StagingContainer's two-handler wiring.
    const onOpenChange = (open: boolean) => {
      if (!open) {
        queueMicrotask(() => {
          if (promotionResolveRef.current) {
            promotionResolveRef.current({ success: false });
            promotionResolveRef.current = null;
          }
        });
      }
    };
    const onSuccess = (result: { jobId: string; stagedVacancyId: string }) => {
      if (promotionResolveRef.current) {
        promotionResolveRef.current({
          success: true,
          createdJobId: result.jobId,
        });
        promotionResolveRef.current = null;
      }
    };

    renderDialog({ onOpenChange, onSuccess });

    await act(async () => {
      clickPromote();
    });

    const resolved = await resolvedWith;
    // The race MUST resolve to success with the jobId — not the
    // microtask's fallback cancel signal.
    expect(resolved).toEqual({
      success: true,
      createdJobId: "job-race-777",
    });
    // And the settled value must be the success signal, confirming the
    // ordering invariant held under the microtask race.
    expect(settledValue).toEqual({
      success: true,
      createdJobId: "job-race-777",
    });
  });

  it("does NOT invoke onSuccess when the server action fails", async () => {
    promoteMock.mockResolvedValue({
      success: false,
      message: "errors.promoteStagedVacancy",
    });

    const { onSuccess, onOpenChange } = renderDialog();

    await act(async () => {
      clickPromote();
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });

    expect(onSuccess).not.toHaveBeenCalled();
    // Dialog stays open on failure (only receives `false` from our render's
    // initial open change inside handleOpenChange if the user dismisses it).
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  // -------------------------------------------------------------------
  // Sprint 2 H-A-03 regression guards
  // Previously the "success && !data" branch fired a SUCCESS toast AND
  // closed the dialog without calling onSuccess — producing a
  // contradictory UX where the user saw "Promoted!" while the deck
  // rolled the card back. The fix flips this to "fail loud at contract
  // drift": destructive toast, dialog stays OPEN, no onSuccess, an
  // error-level log (so it's visible in telemetry). These tests pin
  // every piece of the new behaviour so a future refactor cannot
  // silently re-introduce the contradiction.
  // -------------------------------------------------------------------
  it("H-A-03: fires destructive toast when the server action returns success without data", async () => {
    promoteMock.mockResolvedValue({
      success: true,
      // Intentionally omit `data` to simulate contract drift.
    });

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { onSuccess } = renderDialog();

    await act(async () => {
      clickPromote();
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });

    // Must NOT have fired a success toast.
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success" }),
    );
    // Must NOT have called onSuccess — downstream celebration would
    // crash on undefined.jobId.
    expect(onSuccess).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("H-A-03: does NOT close the dialog when the server action returns success without data", async () => {
    promoteMock.mockResolvedValue({
      success: true,
      // Intentionally omit `data` to simulate contract drift.
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { onOpenChange } = renderDialog();

    await act(async () => {
      clickPromote();
    });

    // Give the async handler time to run.
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });

    // The dialog stays OPEN so the user can press Cancel explicitly.
    // `onOpenChange(false)` must NOT have fired in this flow.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    errorSpy.mockRestore();
  });

  it("H-A-03: logs an error (not just a warn) on contract drift for telemetry visibility", async () => {
    promoteMock.mockResolvedValue({
      success: true,
      // Intentionally omit `data`.
    });

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    renderDialog();

    await act(async () => {
      clickPromote();
    });

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Contract drift"),
        expect.any(Object),
      );
    });

    errorSpy.mockRestore();
  });

  it("H-A-03: end-to-end — contract drift resolves promotionResolveRef to { success: false } via cancel", async () => {
    // Full chain simulation: the user presses Cancel after the
    // destructive toast, which triggers onOpenChange(false), which
    // fires the StagingContainer microtask cleanup that resolves
    // promotionResolveRef with { success: false }. The deck card rolls
    // back — an HONEST failure signal, not a contradictory success.
    promoteMock.mockResolvedValue({
      success: true,
      // Intentionally omit `data`.
    });

    const promotionResolveRef: {
      current: ((result: { success: boolean; createdJobId?: string }) => void) | null;
    } = { current: null };

    const resolvedWith = new Promise<{
      success: boolean;
      createdJobId?: string;
    }>((resolve) => {
      promotionResolveRef.current = resolve;
    });

    // Verbatim StagingContainer wiring.
    const onOpenChange = (open: boolean) => {
      if (!open) {
        queueMicrotask(() => {
          if (promotionResolveRef.current) {
            promotionResolveRef.current({ success: false });
            promotionResolveRef.current = null;
          }
        });
      }
    };
    const onSuccess = jest.fn();

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    render(
      <PromotionDialog
        open={true}
        onOpenChange={onOpenChange}
        vacancy={vacancy}
        onSuccess={onSuccess}
      />,
    );

    await act(async () => {
      clickPromote();
    });

    // After the destructive toast fires, simulate the user clicking Cancel.
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
    expect(onSuccess).not.toHaveBeenCalled();

    // Simulate Cancel click — the dialog's footer "Cancel" button.
    const cancelBtn = screen.getByRole("button", { name: "common.cancel" });
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    const resolved = await resolvedWith;
    // The deck ref MUST see a failure signal — NOT { success: true }.
    expect(resolved).toEqual({ success: false });
    // And the success handler was never called.
    expect(onSuccess).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
