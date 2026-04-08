# Module-Specific Tests

> **For humans and LLMs:** Module-specific tests belong in the module directory, not here.

## Where to put tests

| Test type | Location |
|-----------|----------|
| Module-specific (translator, search, manifest) | `src/lib/connector/{type}/modules/{name}/__tests__/` |
| Cross-module (registry, registration, i18n validation) | `__tests__/connector/` (this directory) |
| UI component tests | `__tests__/` (root) |

## Self-Contained Module Pattern

Each module directory is a Bounded Context that owns everything:

```
modules/eures/
  ├── index.ts          # Implementation + self-registration
  ├── manifest.ts       # Manifest with i18n field
  ├── i18n.ts           # Co-located translations (4 locales)
  ├── resilience.ts     # Resilience policy (optional)
  └── __tests__/        # Module-specific tests ← HERE
      └── eures.spec.ts
```

## Existing cross-module tests (stay here)

- `manifest-i18n.spec.ts` — Validates ALL modules have i18n for all locales
- `self-registration.spec.ts` — Validates register-all.ts registers all modules
- `i18n-utils.spec.ts` — Unit tests for shared i18n resolution utilities

These test cross-cutting concerns, not individual modules, so they belong here.
