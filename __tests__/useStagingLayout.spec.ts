/**
 * useStagingLayout hook tests
 *
 * Tests: default size, persistence of all three valid values, fallback to
 * default on invalid stored value, SSR safety (no window access during
 * initial render — default used until useEffect hydrates from localStorage).
 */
import { renderHook, act } from "@testing-library/react";
import {
  useStagingLayout,
  getPersistedStagingLayoutSize,
  persistStagingLayoutSize,
  getStagingMaxWidthClass,
  type StagingLayoutSize,
} from "@/hooks/useStagingLayout";

const STORAGE_KEY = "jobsync-staging-layout-size";

describe("getPersistedStagingLayoutSize", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default when nothing stored", () => {
    expect(getPersistedStagingLayoutSize()).toBe("default");
  });

  it("returns compact when compact is stored", () => {
    localStorage.setItem(STORAGE_KEY, "compact");
    expect(getPersistedStagingLayoutSize()).toBe("compact");
  });

  it("returns default when default is stored", () => {
    localStorage.setItem(STORAGE_KEY, "default");
    expect(getPersistedStagingLayoutSize()).toBe("default");
  });

  it("returns comfortable when comfortable is stored", () => {
    localStorage.setItem(STORAGE_KEY, "comfortable");
    expect(getPersistedStagingLayoutSize()).toBe("comfortable");
  });

  it("falls back to default on invalid stored value", () => {
    localStorage.setItem(STORAGE_KEY, "enormous");
    expect(getPersistedStagingLayoutSize()).toBe("default");
  });

  it("falls back to default on empty string", () => {
    localStorage.setItem(STORAGE_KEY, "");
    expect(getPersistedStagingLayoutSize()).toBe("default");
  });

  it("does not throw when localStorage.getItem throws", () => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = jest.fn(() => {
      throw new Error("quota");
    });
    try {
      expect(() => getPersistedStagingLayoutSize()).not.toThrow();
      expect(getPersistedStagingLayoutSize()).toBe("default");
    } finally {
      Storage.prototype.getItem = originalGetItem;
    }
  });
});

describe("persistStagingLayoutSize", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes compact to localStorage", () => {
    persistStagingLayoutSize("compact");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("compact");
  });

  it("writes default to localStorage", () => {
    persistStagingLayoutSize("default");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("default");
  });

  it("writes comfortable to localStorage", () => {
    persistStagingLayoutSize("comfortable");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("comfortable");
  });

  it("round-trips through getPersistedStagingLayoutSize", () => {
    const values: StagingLayoutSize[] = ["compact", "default", "comfortable"];
    for (const value of values) {
      persistStagingLayoutSize(value);
      expect(getPersistedStagingLayoutSize()).toBe(value);
    }
  });

  it("does not throw when localStorage.setItem throws", () => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = jest.fn(() => {
      throw new Error("quota");
    });
    try {
      expect(() => persistStagingLayoutSize("comfortable")).not.toThrow();
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  });
});

describe("useStagingLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initial render yields default size (SSR-safe)", () => {
    const { result } = renderHook(() => useStagingLayout());
    // After initial render + useEffect runs, with nothing stored, it remains default.
    expect(result.current.size).toBe("default");
  });

  it("hydrates stored compact value from localStorage on mount", () => {
    localStorage.setItem(STORAGE_KEY, "compact");
    const { result } = renderHook(() => useStagingLayout());
    expect(result.current.size).toBe("compact");
  });

  it("hydrates stored comfortable value from localStorage on mount", () => {
    localStorage.setItem(STORAGE_KEY, "comfortable");
    const { result } = renderHook(() => useStagingLayout());
    expect(result.current.size).toBe("comfortable");
  });

  it("ignores invalid stored value and stays at default", () => {
    localStorage.setItem(STORAGE_KEY, "huge");
    const { result } = renderHook(() => useStagingLayout());
    expect(result.current.size).toBe("default");
  });

  it("setSize updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useStagingLayout());

    act(() => {
      result.current.setSize("compact");
    });
    expect(result.current.size).toBe("compact");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("compact");

    act(() => {
      result.current.setSize("comfortable");
    });
    expect(result.current.size).toBe("comfortable");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("comfortable");

    act(() => {
      result.current.setSize("default");
    });
    expect(result.current.size).toBe("default");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("default");
  });

  it("new hook instance reads back previously persisted value", () => {
    const { result: first } = renderHook(() => useStagingLayout());
    act(() => {
      first.current.setSize("comfortable");
    });

    // New hook instance — simulates a fresh mount (e.g., navigation).
    const { result: second } = renderHook(() => useStagingLayout());
    expect(second.current.size).toBe("comfortable");
  });
});

describe("getStagingMaxWidthClass", () => {
  it("returns max-w-3xl for compact", () => {
    expect(getStagingMaxWidthClass("compact")).toBe("max-w-3xl");
  });

  it("returns max-w-5xl for default", () => {
    expect(getStagingMaxWidthClass("default")).toBe("max-w-5xl");
  });

  it("returns max-w-7xl for comfortable", () => {
    expect(getStagingMaxWidthClass("comfortable")).toBe("max-w-7xl");
  });
});
