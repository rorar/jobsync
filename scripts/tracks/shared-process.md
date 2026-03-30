# Shared Process Requirements — Injected into ALL Track Prompts

## PDCA-Zyklus (Plan-Do-Check-Act)

Follow this checklist for EVERY feature, phase, step, and sprint:

### PLAN
- [ ] Create detailed plans, use /workflow-orchestration-patterns for durable workflow design
- [ ] For UX/UI topics: consult ui-design agents (ui-design:ui-designer, ui-design:accessibility-expert) for best practices; identify UX/UI gaps
- [ ] Deep-dive into the ROADMAP (docs/ROADMAP.md) and check for cross-dependencies to other features/feature sets
- [ ] Spawn specialized team agents for planning and solving (agent-teams:team-lead, feature-dev:code-architect)
- [ ] For decisions: choose the MOST SUSTAINABLE path based on DDD and the ROADMAP, not the easiest. Consult Allium specs (allium:tend, allium:weed) when domain rules are involved

### DO
- [ ] Use ALWAYS /full-stack-orchestration:full-stack-feature for implementation
- [ ] Spawn specialized team agents (agent-teams:team-implementer) for parallel work with clear file ownership
- [ ] All UI strings in 4 locales (en, de, fr, es) — use own namespace file to avoid conflicts with parallel tracks
- [ ] Tests required for ALL new code (unit, component, integration)
- [ ] Commit with logical grouping, conventional commits format

### CHECK
- [ ] After EACH phase/step/sprint: run /comprehensive-review:full-review with ALL dimensions:
  - Architecture Review (comprehensive-review:architect-review)
  - Security Audit (comprehensive-review:security-auditor) — OWASP Top 10
  - Performance Analysis (application-performance:performance-engineer)
  - Test Coverage (full-stack-orchestration:test-automator)
  - Best Practices (javascript-typescript:typescript-pro)
- [ ] Fix ALL findings on-the-fly (Critical + High immediately, Medium before next step)
- [ ] Check for cross-dependencies to other features/feature sets in the ROADMAP
- [ ] After EACH phase/step/sprint: blind spot check "Woran haben wir nicht gedacht?"

### ACT
- [ ] For findings: spawn specialized teams to fix issues and plan ahead for other ROADMAP features
- [ ] Update/create documentation per docs/documentation-agents.md:
  - Update CLAUDE.md with new patterns/rules
  - Write ADRs for architecture decisions (documentation-generation:architecture-decision-records)
  - Update ROADMAP.md (mark items as DONE, add new items discovered)
  - Use allium:weed to check spec-code alignment
- [ ] Extend test suite (E2E with Playwright, unit tests, component tests)
- [ ] Final blind spot check before marking as complete

## Post-Implementation Checks
- [ ] After "Full-Stack Feature Development Complete":
  - Run post-implementation blind spot check "Woran haben wir nicht gedacht?"
  - Fix ALL gaps, bugs, and issues autonomously
  - Verify: build passes, all tests green, i18n consistent, no hardcoded strings
