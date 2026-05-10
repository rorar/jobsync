# Handoff

## State
I completed PERF-2: async PBKDF2 + LRU derived-key cache in `src/lib/encryption.ts`. All 10 consumers updated, 20 new tests, spec IV-split bug fixed, CLAUDE.md + CHANGELOG.md updated. 3 commits pushed (`30ef25e`, `cbf3987`, `b618836`). 219 test suites, 4189 tests green, build clean.

## Next
1. Write `specs/crm.allium` — JobSync's OWN CRM spec using all 4 reference specs as input (step 1 in `project_crm_planning.md`)
2. S2 (UX Journeys) + S3 (CRM Core) staged prompts still open
3. PERF-3 (DispatchContext — 15→6 DB queries) now benefits from async decrypt

## Context
- `smtp.actions.ts:toDTO()` was made async (hidden dependency on decrypt) — watch for similar patterns if more encrypt/decrypt consumers appear
- `apiKey.actions.ts:209` uses double-await: `await (await import(...)).decrypt(...)` due to dynamic import
- All Allium specs aligned post-PERF-2 — weed confirmed 0 new divergences
