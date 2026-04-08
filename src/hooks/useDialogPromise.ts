"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Hook that bridges async deck actions with synchronous dialog flows.
 * Returns a Promise from the action handler that resolves when the dialog
 * confirms (success) or cancels (failure).
 *
 * Uses queueMicrotask to handle the race between onOpenChange(false)
 * and onSuccess firing in the same synchronous block.
 */
export function useDialogPromise<T>() {
  const resolveRef = useRef<((result: { success: boolean }) => void) | null>(null);

  // Cleanup on unmount — resolve pending promise to prevent permanent UI freeze
  useEffect(() => {
    return () => {
      if (resolveRef.current) {
        resolveRef.current({ success: false });
        resolveRef.current = null;
      }
    };
  }, []);

  /** Open the dialog and return a promise that resolves on confirm/cancel */
  const request = useCallback((
    setData: (data: T) => void,
    setOpen: (open: boolean) => void,
    data: T,
  ): Promise<{ success: boolean }> => {
    return new Promise<{ success: boolean }>((resolve) => {
      resolveRef.current = resolve;
      setData(data);
      setOpen(true);
    });
  }, []);

  /** Resolve the pending promise as success */
  const resolve = useCallback((success: boolean) => {
    if (resolveRef.current) {
      resolveRef.current({ success });
      resolveRef.current = null;
    }
  }, []);

  /** Handle dialog close — cancel via queueMicrotask (lets onSuccess fire first) */
  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      queueMicrotask(() => {
        if (resolveRef.current) {
          resolveRef.current({ success: false });
          resolveRef.current = null;
        }
      });
    }
  }, []);

  return { request, resolve, handleClose };
}
