# Testing & Validation: Manifest-Driven AutomationWizard

## Test Suite (141 new tests, 76 suites, 1654 total)

| File | Tests | Coverage |
|---|---|---|
| `DynamicParamsForm.spec.tsx` | 57 | Field types, i18n fallback, empty states, onChange |
| `widget-registry.spec.ts` | 17 | Known/unknown widgets, resolveWidgetOverrides |
| `useAutomationWizard.spec.ts` | 67 | Steps, navigation, module change, defaults, edit mode, scheduleFrequency, EURES language |
| `eures-connector-params.spec.ts` | 40 | All 9 EURES params, defaults, combined params |

## Security Findings

| Severity | ID | Finding | Fix |
|---|---|---|---|
| **MEDIUM** | S-1 | `jobBoard` not validated against registry on create/update | Add registry check in actions |
| **MEDIUM** | S-2 | Extraneous connectorParams keys not stripped | Strip undeclared keys in validator |
| LOW | S-3 | No max length on connectorParams JSON | Add `.max(10000)` to Zod schema |
| LOW | S-4 | String type fields not validated | Add typeof + maxLength check |
| LOW | S-5 | No prototype pollution guard | Solved by S-2 (strip unknown keys) |
| LOW | S-9 | Empty string connectorParams not normalized in create | Normalize to undefined |
| INFO | S-6 | i18n key exposure in fallback | No action (React escaping sufficient) |
| INFO | S-7 | SSRF blocklist incomplete for future | Document intent |
| INFO | S-8 | deactivateModule global scope | Document intent |

## Performance Findings

| Impact | ID | Finding | Fix |
|---|---|---|---|
| **HIGH** | P-2.1 | Static EURES widget imports (20-40KB unnecessary JS) | Use `dynamic()` imports |
| **HIGH** | P-7.1 | Unbounded EURES pagination (memory/latency risk) | Add MAX_PAGES cap |
| MEDIUM | P-1.1 | useEffect cascade (2x re-renders per param) | Direct sync instead of effect |
| MEDIUM | P-4.1 | Dictionary size 70KB (8-12KB gzip overhead) | Future: split dictionaries |
| LOW | P-7.2 | Array.includes instead of Set | Use Set for consistency |

## Action Items (must fix before delivery)

1. **S-1**: Add `moduleRegistry.get(jobBoard)` check in createAutomation + updateAutomation
2. **S-2**: Strip undeclared keys + prototype pollution guard in params-validator
3. **S-3**: Add `.max(10000)` to connectorParams Zod schema
4. **S-4**: Add string type validation in params-validator
5. **P-2.1**: Change widget-registry to use `dynamic()` imports
6. **P-7.1**: Add `MAX_PAGES = 10` cap in EURES search pagination
7. **P-1.1**: Eliminate useEffect cascade in useAutomationWizard
8. **S-9**: Normalize empty string connectorParams
