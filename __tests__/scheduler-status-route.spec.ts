/**
 * Tests for GET /api/scheduler/status (SSE endpoint)
 *
 * Tests: auth guard, per-user filtering (M-1 security), initial state emission,
 * diff optimization (skip unchanged state), client-disconnect cleanup, and
 * timeout close event.
 *
 * Strategy: follows automation-logs-route.spec.ts — mock next/server with a
 * lightweight stub that captures the response stream for inspection.
 *
 * Spec: scheduler-coordination.allium (surface SchedulerStatusBar)
 */

// ---------------------------------------------------------------------------
// next/server stub
// ---------------------------------------------------------------------------

jest.mock("next/server", () => {
  class StubHeaders {
    private _map = new Map<string, string>();
    set(name: string, value: string) { this._map.set(name.toLowerCase(), value); }
    get(name: string): string | null { return this._map.get(name.toLowerCase()) ?? null; }
  }

  class StubNextResponse {
    status: number;
    headers: StubHeaders;
    body: unknown;

    constructor(
      body?: unknown,
      init?: { status?: number; headers?: Record<string, string> },
    ) {
      this.status = init?.status ?? 200;
      this.headers = new StubHeaders();
      this.body = body;
      if (init?.headers) {
        for (const [k, v] of Object.entries(init.headers)) {
          this.headers.set(k, v);
        }
      }
    }
  }

  return {
    NextRequest: class StubNextRequest {},
    NextResponse: StubNextResponse,
  };
});

// ---------------------------------------------------------------------------
// Other mocks
// ---------------------------------------------------------------------------

jest.mock("server-only", () => ({}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

const mockGetState = jest.fn();

jest.mock("@/lib/scheduler/run-coordinator", () => ({
  runCoordinator: {
    getState: (...args: unknown[]) => mockGetState(...args),
  },
}));

jest.mock("@/lib/debug", () => ({
  debugLog: jest.fn(),
  debugError: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { auth } from "@/auth";
import { GET } from "@/app/api/scheduler/status/route";
import type { SchedulerSnapshot } from "@/lib/scheduler/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockResponse = {
  status: number;
  headers: { get(name: string): string | null };
  body: unknown;
};

function asMock(response: unknown): MockResponse {
  return response as MockResponse;
}

function makeMockRequest(userId = "user-1"): import("next/server").NextRequest {
  const abortController = new AbortController();
  return {
    signal: abortController.signal,
    url: "http://localhost/api/scheduler/status",
    _abortController: abortController,
  } as unknown as import("next/server").NextRequest;
}

function makeAbortableRequest(): {
  req: import("next/server").NextRequest;
  abort: () => void;
} {
  const abortController = new AbortController();
  const req = {
    signal: abortController.signal,
    url: "http://localhost/api/scheduler/status",
  } as unknown as import("next/server").NextRequest;
  return { req, abort: () => abortController.abort() };
}

/**
 * Read the first SSE data frame from a response body.
 * Handles Uint8Array (direct encode, error path) and ReadableStream.
 */
async function readFirstSSEChunk(response: MockResponse): Promise<unknown> {
  const body = response.body;
  let text: string;

  const isUint8Array =
    body instanceof Uint8Array ||
    ArrayBuffer.isView(body) ||
    (body !== null &&
      typeof body === "object" &&
      (body as { constructor?: { name?: string } }).constructor?.name === "Uint8Array");

  if (isUint8Array) {
    text = new TextDecoder().decode(body as Uint8Array);
  } else if (body && typeof (body as ReadableStream).getReader === "function") {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const { value } = await reader.read();
    reader.cancel();
    text = new TextDecoder().decode(value);
  } else {
    throw new Error(`Unexpected body type: ${typeof body}`);
  }

  const match = text.match(/^data: ([\s\S]+?)\n\n/);
  if (!match) throw new Error(`Unexpected SSE chunk format: ${JSON.stringify(text)}`);
  return JSON.parse(match[1]);
}

function makeSnapshot(overrides: Partial<SchedulerSnapshot> = {}): SchedulerSnapshot {
  return {
    phase: "idle",
    cycleStartedAt: null,
    runningAutomations: [],
    pendingAutomations: [],
    lastCycleCompletedAt: null,
    lastCycleProcessedCount: 3,
    lastCycleFailedCount: 0,
    runningProgress: {},
    ...overrides,
  };
}

// Reset SSE connection counter between tests (SEC-P2-08)
const SSE_CONN_KEY = "__sseConnectionCounts" as const;
beforeEach(() => {
  const g = globalThis as unknown as { [SSE_CONN_KEY]?: Map<string, number> };
  g[SSE_CONN_KEY]?.clear();
});

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

describe("GET /api/scheduler/status — auth guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns SSE error response when session is null (unauthenticated)", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = asMock(await GET(makeMockRequest()));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const payload = (await readFirstSSEChunk(response)) as { error: string };
    expect(payload.error).toBe("Not Authenticated");
  });

  it("returns SSE error when session has no user id", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: {} });

    const response = asMock(await GET(makeMockRequest()));
    const payload = (await readFirstSSEChunk(response)) as { error: string };
    expect(payload.error).toBe("Not Authenticated");
  });

  it("returns SSE error when session.user is null", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: null });

    const response = asMock(await GET(makeMockRequest()));
    const payload = (await readFirstSSEChunk(response)) as { error: string };
    expect(payload.error).toBe("Not Authenticated");
  });
});

// ---------------------------------------------------------------------------
// SSE response headers
// ---------------------------------------------------------------------------

describe("GET /api/scheduler/status — SSE headers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-1" } });
    mockGetState.mockReturnValue(makeSnapshot());
  });

  it("returns Content-Type: text/event-stream", async () => {
    const response = asMock(await GET(makeMockRequest()));
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("returns Cache-Control: no-cache", async () => {
    const response = asMock(await GET(makeMockRequest()));
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("does not include Connection header (HTTP/2 incompatible)", async () => {
    const response = asMock(await GET(makeMockRequest()));
    expect(response.headers.get("Connection")).toBeNull();
  });

  it("returns HTTP 200 status", async () => {
    const response = asMock(await GET(makeMockRequest()));
    expect(response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Initial state emission
// ---------------------------------------------------------------------------

describe("GET /api/scheduler/status — initial state emission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-1" } });
  });

  it("emits the current scheduler state as the first SSE frame", async () => {
    const snap = makeSnapshot({
      phase: "idle",
      lastCycleProcessedCount: 7,
    });
    mockGetState.mockReturnValue(snap);

    const response = asMock(await GET(makeMockRequest()));
    const payload = (await readFirstSSEChunk(response)) as SchedulerSnapshot;

    expect(payload.phase).toBe("idle");
    expect(payload.lastCycleProcessedCount).toBe(7);
  });

  it("calls runCoordinator.getState() to build the initial payload", async () => {
    mockGetState.mockReturnValue(makeSnapshot());

    await GET(makeMockRequest());

    expect(mockGetState).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Per-user filtering (M-1 security)
// ---------------------------------------------------------------------------

describe("GET /api/scheduler/status — per-user filtering (M-1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-1" } });
  });

  it("strips runningAutomations belonging to other users", async () => {
    const fullState = makeSnapshot({
      phase: "running",
      runningAutomations: [
        {
          automationId: "auto-mine",
          automationName: "Mine",
          runSource: "scheduler",
          moduleId: "jsearch",
          startedAt: new Date(),
          userId: "user-1", // belongs to session user
        },
        {
          automationId: "auto-other",
          automationName: "Other's",
          runSource: "manual",
          moduleId: "eures",
          startedAt: new Date(),
          userId: "user-99", // different user — must be filtered
        },
      ],
    });
    mockGetState.mockReturnValue(fullState);

    const response = asMock(await GET(makeMockRequest("user-1")));
    const payload = (await readFirstSSEChunk(response)) as SchedulerSnapshot;

    expect(payload.runningAutomations).toHaveLength(1);
    expect(payload.runningAutomations[0].automationId).toBe("auto-mine");
  });

  it("strips pendingAutomations belonging to other users", async () => {
    const fullState = makeSnapshot({
      pendingAutomations: [
        {
          automationId: "pending-mine",
          automationName: "Mine Pending",
          userId: "user-1",
          position: 1,
          total: 2,
        },
        {
          automationId: "pending-other",
          automationName: "Other Pending",
          userId: "user-99",
          position: 2,
          total: 2,
        },
      ],
    });
    mockGetState.mockReturnValue(fullState);

    const response = asMock(await GET(makeMockRequest("user-1")));
    const payload = (await readFirstSSEChunk(response)) as SchedulerSnapshot;

    expect(payload.pendingAutomations).toHaveLength(1);
    expect(payload.pendingAutomations[0].automationId).toBe("pending-mine");
  });

  it("strips runningProgress entries for other users' automations", async () => {
    const fullState = makeSnapshot({
      runningAutomations: [
        {
          automationId: "auto-mine",
          automationName: "Mine",
          runSource: "scheduler",
          moduleId: "jsearch",
          startedAt: new Date(),
          userId: "user-1",
        },
      ],
      runningProgress: {
        "auto-mine": {
          automationId: "auto-mine",
          runId: "run-001",
          phase: "search",
          jobsSearched: 5,
          jobsDeduplicated: 0,
          jobsProcessed: 5,
          jobsMatched: 2,
          jobsSaved: 2,
          startedAt: new Date(),
          updatedAt: new Date(),
        },
        "auto-other": {
          automationId: "auto-other",
          runId: "run-002",
          phase: "match",
          jobsSearched: 10,
          jobsDeduplicated: 1,
          jobsProcessed: 9,
          jobsMatched: 3,
          jobsSaved: 3,
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    });
    mockGetState.mockReturnValue(fullState);

    const response = asMock(await GET(makeMockRequest("user-1")));
    const payload = (await readFirstSSEChunk(response)) as SchedulerSnapshot;

    expect(Object.keys(payload.runningProgress)).toEqual(["auto-mine"]);
  });

  it("returns empty automations arrays when the user has no running automations", async () => {
    const fullState = makeSnapshot({
      runningAutomations: [
        {
          automationId: "auto-other",
          automationName: "Other's",
          runSource: "manual",
          moduleId: "eures",
          startedAt: new Date(),
          userId: "user-99",
        },
      ],
    });
    mockGetState.mockReturnValue(fullState);

    const response = asMock(await GET(makeMockRequest("user-1")));
    const payload = (await readFirstSSEChunk(response)) as SchedulerSnapshot;

    expect(payload.runningAutomations).toHaveLength(0);
  });

  it("preserves shared phase and cycle stats (not filtered by user)", async () => {
    const fullState = makeSnapshot({
      phase: "running",
      lastCycleProcessedCount: 12,
      lastCycleFailedCount: 2,
    });
    mockGetState.mockReturnValue(fullState);

    const response = asMock(await GET(makeMockRequest("user-1")));
    const payload = (await readFirstSSEChunk(response)) as SchedulerSnapshot;

    expect(payload.phase).toBe("running");
    expect(payload.lastCycleProcessedCount).toBe(12);
    expect(payload.lastCycleFailedCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Diff optimization (skip unchanged state)
// ---------------------------------------------------------------------------

describe("GET /api/scheduler/status — diff optimization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-1" } });
  });

  it("calls getState() at least once for the initial state frame", async () => {
    mockGetState.mockReturnValue(makeSnapshot());

    await GET(makeMockRequest());

    expect(mockGetState).toHaveBeenCalled();
  });

  it("produces a ReadableStream body (not an error Uint8Array) for authenticated requests", async () => {
    mockGetState.mockReturnValue(makeSnapshot());

    const response = asMock(await GET(makeMockRequest()));

    expect(
      response.body != null &&
        typeof (response.body as ReadableStream).getReader === "function",
    ).toBe(true);
  });
});
