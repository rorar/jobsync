# Shared Process Requirements — Injected into ALL Track Prompts

## Required Reading (before writing ANY code)

Read these files FIRST — they contain architecture decisions, dependency maps, and resolved questions that inform your implementation:

1. **CLAUDE.md** (project root) — coding conventions, DDD principles, connector architecture, scheduler coordination rules
2. **Masterplan**: `/home/pascal/.claude/plans/open-architecture-masterplan.md` — Sprint priorities, cross-dependency map, resolved Allium questions, UX wireframes
3. **ROADMAP**: `docs/ROADMAP.md` — full feature specs, architecture invariants, cross-references
4. **Allium Specs**: `specs/*.allium` — domain rules, contracts, invariants (source of truth)
5. **ADRs**: `docs/adr/` — architecture decision records (especially ADR-014 for scheduler coordination)
6. **Documentation Agents**: `docs/documentation-agents.md` — which agent/skill to use for which documentation type
7. **Merge Guide**: `scripts/tracks/MERGE-GUIDE.md` — merge order, conflict zones, your track's file ownership

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
- [ ] **Git commits:** Make commits FREQUENTLY — after each logical unit of work, not at the end.
  - Use conventional commits: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`
  - Include `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>` on every commit
  - Run `bun run build` and `bash scripts/test.sh --no-coverage` BEFORE each commit
  - Group logically: schema + model + actions = 1 commit, UI components = 1 commit, tests = 1 commit
  - Never make one giant commit at the end — if the session crashes, uncommitted work is lost

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
