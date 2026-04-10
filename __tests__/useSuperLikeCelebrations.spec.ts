/**
 * useSuperLikeCelebrations hook tests (Stream D / task 3).
 *
 * Tests: enqueue, FIFO ordering, cap at 5, dismiss by id, removeByJobId,
 * queueRemaining math.
 */
import { renderHook, act } from "@testing-library/react";
import { useSuperLikeCelebrations } from "@/hooks/useSuperLikeCelebrations";

describe("useSuperLikeCelebrations", () => {
  it("starts with an empty queue", () => {
    const { result } = renderHook(() => useSuperLikeCelebrations());

    expect(result.current.items).toEqual([]);
    expect(result.current.current).toBeNull();
    expect(result.current.queueRemaining).toBe(0);
  });

  it("add() enqueues a celebration as the current item", () => {
    const { result } = renderHook(() => useSuperLikeCelebrations());

    act(() => {
      result.current.add({ jobId: "job-1", vacancyTitle: "Senior Engineer" });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.current?.jobId).toBe("job-1");
    expect(result.current.current?.vacancyTitle).toBe("Senior Engineer");
    expect(result.current.queueRemaining).toBe(0);
  });

  it("FIFO order: current is the oldest entry", () => {
    const { result } = renderHook(() => useSuperLikeCelebrations());

    act(() => {
      result.current.add({ jobId: "job-1", vacancyTitle: "First" });
    });
    act(() => {
      result.current.add({ jobId: "job-2", vacancyTitle: "Second" });
    });
    act(() => {
      result.current.add({ jobId: "job-3", vacancyTitle: "Third" });
    });

    expect(result.current.items).toHaveLength(3);
    expect(result.current.current?.jobId).toBe("job-1");
    expect(result.current.queueRemaining).toBe(2);
  });

  it("queue caps at 5; the 6th add drops the oldest entry", () => {
    const { result } = renderHook(() => useSuperLikeCelebrations());

    act(() => {
      result.current.add({ jobId: "job-1", vacancyTitle: "First" });
      result.current.add({ jobId: "job-2", vacancyTitle: "Second" });
      result.current.add({ jobId: "job-3", vacancyTitle: "Third" });
      result.current.add({ jobId: "job-4", vacancyTitle: "Fourth" });
      result.current.add({ jobId: "job-5", vacancyTitle: "Fifth" });
    });

    expect(result.current.items).toHaveLength(5);
    expect(result.current.current?.jobId).toBe("job-1");

    act(() => {
      result.current.add({ jobId: "job-6", vacancyTitle: "Sixth" });
    });

    expect(result.current.items).toHaveLength(5);
    // job-1 was dropped, job-2 is now the oldest / current
    expect(result.current.current?.jobId).toBe("job-2");
    expect(result.current.items[result.current.items.length - 1]?.jobId).toBe("job-6");
  });

  it("dismiss() removes a celebration by id", () => {
    const { result } = renderHook(() => useSuperLikeCelebrations());

    act(() => {
      result.current.add({ jobId: "job-1", vacancyTitle: "First" });
      result.current.add({ jobId: "job-2", vacancyTitle: "Second" });
    });

    expect(result.current.current?.jobId).toBe("job-1");

    act(() => {
      result.current.dismiss("job-1");
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.current?.jobId).toBe("job-2");
    expect(result.current.queueRemaining).toBe(0);
  });

  it("removeByJobId() removes a celebration by jobId", () => {
    const { result } = renderHook(() => useSuperLikeCelebrations());

    act(() => {
      result.current.add({ jobId: "job-1", vacancyTitle: "First" });
      result.current.add({ jobId: "job-2", vacancyTitle: "Second" });
      result.current.add({ jobId: "job-3", vacancyTitle: "Third" });
    });

    act(() => {
      result.current.removeByJobId("job-2");
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items.map((item) => item.jobId)).toEqual(["job-1", "job-3"]);
  });

  it("queueRemaining reflects items.length - 1, never negative", () => {
    const { result } = renderHook(() => useSuperLikeCelebrations());

    expect(result.current.queueRemaining).toBe(0);

    act(() => {
      result.current.add({ jobId: "job-1", vacancyTitle: "First" });
    });
    expect(result.current.queueRemaining).toBe(0);

    act(() => {
      result.current.add({ jobId: "job-2", vacancyTitle: "Second" });
      result.current.add({ jobId: "job-3", vacancyTitle: "Third" });
    });
    expect(result.current.queueRemaining).toBe(2);

    act(() => {
      result.current.dismiss("job-1");
      result.current.dismiss("job-2");
      result.current.dismiss("job-3");
    });
    expect(result.current.queueRemaining).toBe(0);
    expect(result.current.current).toBeNull();
  });

  it("dismiss() on a non-existent id is a no-op", () => {
    const { result } = renderHook(() => useSuperLikeCelebrations());

    act(() => {
      result.current.add({ jobId: "job-1", vacancyTitle: "First" });
    });

    act(() => {
      result.current.dismiss("does-not-exist");
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.current?.jobId).toBe("job-1");
  });

  it("re-adding the same jobId deduplicates (no stacked duplicates)", () => {
    const { result } = renderHook(() => useSuperLikeCelebrations());

    act(() => {
      result.current.add({ jobId: "job-1", vacancyTitle: "First" });
      result.current.add({ jobId: "job-1", vacancyTitle: "First (re-added)" });
    });

    // Queue length must be 1 — the re-add must not create a second entry.
    expect(result.current.items).toHaveLength(1);
    // The updated title must be persisted — proves the OLD entry was replaced,
    // not silently kept while the new one was dropped.
    expect(result.current.items[0]?.vacancyTitle).toBe("First (re-added)");
    expect(result.current.current?.vacancyTitle).toBe("First (re-added)");
  });

  it("re-adding a middle item moves it to the back of the queue (FIFO position after dedup)", () => {
    const { result } = renderHook(() => useSuperLikeCelebrations());

    act(() => {
      result.current.add({ jobId: "job-1", vacancyTitle: "First" });
      result.current.add({ jobId: "job-2", vacancyTitle: "Second" });
      result.current.add({ jobId: "job-3", vacancyTitle: "Third" });
    });

    // Dedup-re-add job-2: it should be removed from position 1 and appended
    // to the END, so the FIFO order becomes [job-1, job-3, job-2-updated].
    act(() => {
      result.current.add({ jobId: "job-2", vacancyTitle: "Second (updated)" });
    });

    expect(result.current.items).toHaveLength(3);
    // current is still the oldest entry (job-1) — the re-add of job-2 must
    // NOT have changed which item is currently displayed.
    expect(result.current.current?.jobId).toBe("job-1");
    // job-2 (updated) is now at the back.
    const ids = result.current.items.map((i) => i.jobId);
    expect(ids).toEqual(["job-1", "job-3", "job-2"]);
    // And the title was updated, not kept as "Second".
    expect(result.current.items[2]?.vacancyTitle).toBe("Second (updated)");
  });
});
