# Track: Observability Infrastructure (H-P-09)

**ID:** observability_20260601
**Status:** ⛔ Pending — ENTRY-CRITERIA-GATED

## Entry Criteria

Stack-decision ADR (self-hosted OTel + Tempo + Prometheus + Grafana **OR** off-the-shelf
APM). Do NOT start until recorded. 2–3 week dedicated sprint.

## Documents

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)

## Progress

- Phases: 0/5 complete
- Tasks: 0/12 complete

## Scope (BACKLOG §6)

Zero observability today (code-verified: empty grep for OTel/Prometheus at HEAD `b4b20e9`).
Adds tracing + RED metrics + Core Web Vitals + dashboards/SLOs after the stack ADR.
Instrumentation seams: TypedEventBus, RunCoordinator, Cockatiel resilience, `instrumentation.ts`.

## Quick Links

- [Back to Tracks](../../tracks.md)
- [Product Context](../../product.md)
