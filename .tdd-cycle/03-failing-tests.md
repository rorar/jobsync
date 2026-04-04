# TDD RED Phase: Failing Tests

## Test Files Created/Modified
- `__tests__/job.actions.spec.ts` — +5 tests (F5: state machine enforcement, F8: statusId validation)
- `__tests__/crm-actions.spec.ts` — +3 tests (DAU-2: compare-and-swap fromStatusId)
- `__tests__/kanban-data-path.spec.ts` — NEW, 4 tests (DAU-7: data path characterization)
- `__tests__/dictionary-completeness.spec.ts` — NEW, 15 tests (F1: missing error i18n keys)
- `__tests__/form-schema-defaults.spec.ts` — NEW, 2 tests (F10: schema default "draft")

## Results: 21 FAIL, 70 PASS

### Failing (RED — expected)
| Finding | Tests | Why Failing |
|---------|-------|-------------|
| F5 | 1 | updateJob passes statusId directly without state machine validation |
| DAU-2 | 2 | changeJobStatus ignores 4th parameter (fromStatusId doesn't exist) |
| F8 | 1 | addJob never validates statusId existence |
| F1-partial | 15 | errors.duplicateEntry/fetchFailed/referenceError missing from all 4 locales |
| F10 | 2 | Schema defaults to "draft" not "bookmarked" |

### Passing (characterization)
| Finding | Tests | What They Document |
|---------|-------|-------------------|
| DAU-7 | 4 | getKanbanBoard has tags+no pagination (correct); getJobsList lacks both (the gap) |
| F5 | 2 | updateJob allows valid transitions and same-status updates (current behavior) |
| DAU-2 | 1 | changeJobStatus works when fromStatusId matches (vacuous pass) |
| F8 | 1 | addJob succeeds with valid mock data |
