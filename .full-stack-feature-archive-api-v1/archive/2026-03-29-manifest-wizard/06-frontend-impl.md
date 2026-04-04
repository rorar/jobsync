# Frontend Implementation: Manifest-Driven AutomationWizard

## New Components

### DynamicParamsForm.tsx (310 lines)
- Renders form fields from ConnectorParamsSchema array
- 5 field types: number, string, select, multiselect (badge chips), boolean
- i18n: t(field.label) with English fallback
- Section header "Advanced Search Options" only when schema has fields

### widget-registry.tsx (76 lines)
- `getSearchFieldWidget(widgetId)` → React component or null
- `resolveWidgetOverrides(overrides)` → field-name-to-component map
- Registered: eures-occupation → EuresOccupationCombobox, eures-location → EuresLocationCombobox

### useAutomationWizard.ts (344 lines)
- Headless hook with ALL business logic
- Form state, step navigation, module selection → schema update → defaults
- connectorParamsValues management
- EURES language auto-injection preserved
- scheduleFrequency as first-class field
- AI scoring toggle, submit logic, edit mode

### WizardShell.tsx (711 lines)
- Pure presentation, zero business logic
- Widget registry for keywords/location (no hardcoded module checks)
- DynamicParamsForm in Search step
- Review step with ReviewConnectorParams section

## Refactored

### AutomationWizard.tsx (881 → 68 lines)
- Thin wrapper: useAutomationWizard hook + WizardShell in Dialog
- Props interface unchanged (backward compatible)

## Key Achievements
- Zero `jobBoard === "eures"` checks in any wizard file
- EURES language auto-injection preserved in hook
- Edit mode pre-populates dynamic params
- Identical connectorParams JSON output (backward compatible)

## Verification
- 72 suites, 1511 tests passed
- Build: zero type errors
