# Phase 2: Security & Performance Review

## Security Findings (8 total — 0 Critical, 0 High, 2 Medium, 4 Low, 2 Info)

### Medium
- **S-F2**: Rate limiter lacks periodic GC (CWE-770) — stale entries persist
- **S-F4**: TOCTOU race in delete guard (CWE-367) — async gap between check and delete

### Low
- **S-F1**: SSE endpoint not in middleware matcher (CWE-306) — accepted SSE trade-off
- **S-F3**: Rate limiter resets on restart (CWE-799) — acceptable for self-hosted
- **S-F5**: Module contention data stays server-side — currently safe, needs doc
- **S-F6**: SSE connection exhaustion via tabs (CWE-400) — bounded by 10min timeout

### Informational
- **S-F7**: Error messages may leak internal details (CWE-209)
- **S-F8**: Watchdog cleanup complexity warrants documentation

### OWASP Coverage: ALL PASS (A01-A10)

## Performance Findings (14 total — 3 Medium, 6 Low, 3 Positive, 2 N/A)

### Medium (fix next)
- **P-1**: N intervals per RunStatusBadge — share a single timer (15min fix)
- **P-2**: useSchedulerStatus callback instability — use refs for stable callbacks (20min fix)
- **P-7**: Sequential scheduler blocks behind slow runs — future parallel by module

### Low (defer)
- **P-3**: JSON.stringify diff every 2s — add version counter (future)
- **P-4**: getState() allocates on every call — cache with version (future)
- **P-5**: Rate limiter stale entries — fix timestamp logic
- **P-6**: SSE timeout indistinguishable from error — send close event

### Positive Findings
- **P-11**: Singleton EventSource well-designed (prevents 7× connections)
- **P-12**: RunCoordinator Maps properly bounded (no memory leaks)
- **P-14**: Degradation loop emission sub-millisecond

## Critical Issues for Phase 3 Context
- No security blockers found
- P-1 and P-2 are quick performance wins that should be done before shipping
- reportProgress() never called from runner — RunProgressPanel always shows fallback (test gap)
- TOCTOU race in delete guard is narrow but real — document and consider advisory lock
