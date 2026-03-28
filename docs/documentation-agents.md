# Documentation Agents & Skills

Available agents and skills for documentation in JobSync. Use on demand — not all at once.

**Stack:**
- [`claude-code-workflows`](https://github.com/wshobson/claude-code-workflows) (wshobson) — documentation generation, C4 architecture, code review
- [`allium`](https://github.com/juxt/allium) (juxt) — behavioral specifications (elicit, tend, weed, distill, propagate)

## When to use which Agent/Skill?

### Project Documentation (for users and developers)

| Document | Agent/Skill | Trigger |
|---|---|---|
| **Update README.md** | `documentation-generation:docs-architect` | After UI changes, new features, or when screenshots are outdated |
| **Installation Guide** | `documentation-generation:tutorial-engineer` | When 2.13 (Setup UX) or 8.9 (Docker) is implemented |
| **User Guide (Features)** | `documentation-generation:tutorial-engineer` | After implementing a user-facing feature (0.5 Pipeline, 2.7 Tinder, etc.) |
| **CONTRIBUTING.md** | `documentation-generation:docs-architect` | When 8.7 (Module SDK) is implemented — no contribution path exists before that |
| **Architecture Overview** | `documentation-generation:docs-architect` + `documentation-generation:mermaid-expert` | After major architecture changes (0.4 Lifecycle, 0.5 Pipeline, 0.6 Notifications) |

### API Documentation

| Document | Agent/Skill | Trigger |
|---|---|---|
| **Generate OpenAPI Spec** | Skill: `documentation-generation:openapi-spec-generation` | When 7.1 (Public API) is implemented |
| **API Developer Portal** | `documentation-generation:api-documenter` | After 7.1 + 7.2 implementation |
| **API Reference** | `documentation-generation:reference-builder` | For exhaustive parameter/config documentation |

### Architecture Documentation

| Document | Agent/Skill | Trigger |
|---|---|---|
| **C4 System Context** | `c4-architecture:c4-context` | High-level system context: personas, external systems, boundaries. Create after major architectural changes. |
| **C4 Container** | `c4-architecture:c4-container` | Deployment units (Next.js, SQLite, Connectors). Synthesize from component docs. |
| **C4 Component** | `c4-architecture:c4-component` | Logical components within a container. Synthesize from code-level docs. |
| **C4 Code** | `c4-architecture:c4-code` | Code-level: functions, classes, dependencies per directory. Run on specific directories. |
| **Write ADRs** | Skill: `documentation-generation:architecture-decision-records` | After architecture decisions (already in CLAUDE.md Post-Work Checklist) |
| **Diagrams (Mermaid)** | `documentation-generation:mermaid-expert` | Flowcharts, sequence diagrams, ERDs — complements C4 with behavioral flows |
| **Changelog** | Skill: `documentation-generation:changelog-automation` | Before releases — generates changelog from commits/PRs |

### Behavioral Specifications (Allium)

| Task | Agent/Skill | Trigger |
|---|---|---|
| **New spec from scratch** | Skill: `allium:elicit` | New feature area, unclear requirements — structured discovery session |
| **Update existing spec** | `allium:tend` | Add entities, rules, triggers to an existing `.allium` file |
| **Extract spec from code** | Skill: `allium:distill` | Existing code without spec — reverse engineer behavior into Allium |
| **Check spec-code alignment** | `allium:weed` | After implementation — find where spec and code diverged |
| **Generate tests from spec** | Skill: `allium:propagate` | Generate test files from `.allium` spec obligations |

### Code Documentation

| Document | Agent/Skill | Trigger |
|---|---|---|
| **Code Review** | `documentation-generation:docs-architect` | After major implementations (alternatively: `coderabbit:code-review`) |
| **Module Developer Guide** | `documentation-generation:tutorial-engineer` + `documentation-generation:reference-builder` | When 8.7 (Module SDK) is implemented — template repo + manifest reference |

## Agent Overview

### Documentation Generation (wshobson)

| Agent | Namespace | Purpose |
|---|---|---|
| `docs-architect` | `documentation-generation` | Long-form technical manuals, architecture guides from codebase |
| `tutorial-engineer` | `documentation-generation` | Step-by-step tutorials, progressive learning paths |
| `api-documenter` | `documentation-generation` | OpenAPI 3.1, SDK generation, developer portals |
| `reference-builder` | `documentation-generation` | Exhaustive API/config references |
| `mermaid-expert` | `documentation-generation` | Mermaid diagrams (flowcharts, sequence, ERD) |

### C4 Architecture (wshobson)

| Agent | Namespace | Purpose |
|---|---|---|
| `c4-context` | `c4-architecture` | System context: personas, user journeys, external dependencies |
| `c4-container` | `c4-architecture` | Container-level: deployment units, APIs, container interfaces |
| `c4-component` | `c4-architecture` | Component-level: logical boundaries, interfaces, relationships |
| `c4-code` | `c4-architecture` | Code-level: function signatures, dependencies per directory |

C4 works bottom-up: `c4-code` on directories → `c4-component` synthesizes → `c4-container` synthesizes → `c4-context` creates the system overview.

### Allium Specifications (juxt-plugins)

| Skill/Agent | Namespace | Purpose |
|---|---|---|
| `elicit` (skill) | `allium` | Structured discovery — build specs through conversation |
| `tend` (agent) | `allium` | Edit existing specs — add entities, rules, triggers |
| `distill` (skill) | `allium` | Extract spec from existing code (reverse engineering) |
| `weed` (agent) | `allium` | Find spec-code divergences, resolve drift |
| `propagate` (skill) | `allium` | Generate tests from spec obligations |

## Rules

1. **Docs grow WITH features** — no documentation for features that don't exist yet
2. **README.md is the storefront** — keep it up to date, automate screenshots via 8.1
3. **Agents for initial creation, manual maintenance for updates** — agent generates the initial document, then incremental updates by hand
4. **Language:** All documentation AND agent output in English for international reach. When invoking agents, instruct them to produce English output. Internal docs (ADRs, Architecture) also in English.
