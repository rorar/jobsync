# Documentation Agents & Skills

Available agents and skills for documentation in JobSync. Use on demand — not all at once.

**Stack:** All agents/skills from `claude-code-workflows` (wshobson). Canonical namespace: `documentation-generation` (contains all agents). Duplicates in `code-documentation` and `api-testing-observability` are identical — only the canonical name is listed here.

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
| **Write ADRs** | Skill: `documentation-generation:architecture-decision-records` | After architecture decisions (already in CLAUDE.md Post-Work Checklist) |
| **Diagrams (Mermaid)** | `documentation-generation:mermaid-expert` | Flowcharts, sequence diagrams, ERDs for Architecture Overview |
| **Changelog** | Skill: `documentation-generation:changelog-automation` | Before releases — generates changelog from commits/PRs |

### Code Documentation

| Document | Agent/Skill | Trigger |
|---|---|---|
| **Code Review** | `documentation-generation:docs-architect` | After major implementations (alternatively: `coderabbit:code-review`) |
| **Module Developer Guide** | `documentation-generation:tutorial-engineer` + `documentation-generation:reference-builder` | When 8.7 (Module SDK) is implemented — template repo + manifest reference |

## Agent Overview (deduplicated)

| Agent | Canonical Namespace | Purpose |
|---|---|---|
| `docs-architect` | `documentation-generation` | Long-form technical manuals, architecture guides from codebase |
| `tutorial-engineer` | `documentation-generation` | Step-by-step tutorials, progressive learning paths |
| `api-documenter` | `documentation-generation` | OpenAPI 3.1, SDK generation, developer portals |
| `reference-builder` | `documentation-generation` | Exhaustive API/config references |
| `mermaid-expert` | `documentation-generation` | Mermaid diagrams (flowcharts, sequence, ERD) |

## Rules

1. **Docs grow WITH features** — no documentation for features that don't exist yet
2. **README.md is the storefront** — keep it up to date, automate screenshots via 8.1
3. **Agents for initial creation, manual maintenance for updates** — agent generates the initial document, then incremental updates by hand
4. **Language:** All documentation in English for international reach. Internal docs (ADRs, Architecture) in English or German depending on context.
