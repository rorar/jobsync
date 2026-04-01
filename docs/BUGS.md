# Bug Tracker — Collected 2026-03-24, Updated 2026-04-01

**Total: 134 bugs found, 134 fixed, 0 remaining**

### Status: ✅ All bugs are fixed.

## Session S1b Comprehensive Review (2026-04-01) — ALL FIXED

5-dimension review over Sprint A+B+C code (34 files, ~7465 lines). 25 findings fixed.

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S1b-1 | **CRITICAL** | `ConnectorCache` singleton not registered in production — 0% hit rate | Unconditional `globalThis` assignment matching RunCoordinator/EventBus |
| S1b-2 | **CRITICAL** | GET/PATCH/POST `/api/v1/jobs` leak userId, matchData, foreign keys via `include` | Replaced all `include` with explicit `select` (SEC-P2-01) |
| S1b-3 | **HIGH** | PATCH `/api/v1/jobs/:id` — up to 9 sequential DB round-trips | `Promise.all` for independent findOrCreate calls |
| S1b-4 | **HIGH** | POST `/api/v1/jobs` — 5 sequential upserts | `Promise.all` parallelization |
| S1b-5 | **HIGH** | `AutomationDetailPage` duplicate runs fetch on every loadData() | Removed redundant `getAutomationRuns` call |
| S1b-6 | **HIGH** | `getBlacklistEntries` unbounded findMany (no LIMIT) | Added `take: 500` |
| S1b-7 | **HIGH** | `degradation.ts` findUnique without userId (ADR-015 violation) | Changed to `findFirst` |
| S1b-8 | **HIGH** | IP rate limiting trusts spoofable `x-forwarded-for` header | Unique per-request fallback + documentation |
| S1b-9 | **HIGH** | Misleading "constant-time" comment on API key validation | Corrected comment, documented accepted risk |
| S1b-10 | **HIGH** | 11x hardcoded English in `publicApiKey.actions.ts` | Replaced with i18n keys (api.* namespace) |
| S1b-11 | **HIGH** | 3x hardcoded English in `companyBlacklist.actions.ts` | Replaced with i18n keys (blacklist.* namespace) |
| S1b-12 | **HIGH** | 5x hardcoded "Error" toast titles in automation detail page | Replaced with `t("common.error")` |
| S1b-13 | **HIGH** | `event-types.ts` imports `RunSource` from scheduler (bidirectional coupling) | Inlined type definition |
| S1b-14 | **MEDIUM** | SSE endpoint no per-user connection limit | Added max 5 connections per user |
| S1b-15 | **MEDIUM** | Cache eviction was FIFO, not LRU | LRU via Map re-insertion on get() |
| S1b-16 | **MEDIUM** | No periodic prune — expired cache entries accumulate | Added 15-min prune interval |
| S1b-17 | **MEDIUM** | Cache key injection via unsanitized `:` in user input | Sanitize params segment in buildKey |
| S1b-18 | **MEDIUM** | `BlacklistMatchType` missing starts_with/ends_with | Extended type + matcher |
| S1b-19 | **MEDIUM** | Notes GET endpoint unbounded (no pagination) | Added take/skip/count pagination |
| S1b-20 | **MEDIUM** | UUID regex duplicated in 5 locations | Extracted `isValidUUID()` to schemas.ts |
| S1b-21 | **MEDIUM** | 4x duplicate findOrCreate helpers across API routes | Extracted to `helpers.ts` |
| S1b-22 | **MEDIUM** | SSE route double non-null assertion on userId | Explicit validation |
| S1b-23 | **MEDIUM** | Degradation notification messages hardcoded English | Added TODO(i18n) + name truncation |
| S1b-24 | **LOW** | `ViewModeToggle` radiogroup aria-label wrong | Fixed to describe group purpose |
| S1b-25 | **LOW** | Degradation empty catch blocks (no logging) | Added console.warn |

## Session S1a Blind Spot Check #2 (2026-04-01) — ALL FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| BS2-1 | **HIGH** | `dedupHash.findMany` unbounded — loads ALL hashes without time limit | Added 90-day `createdAt` cutoff (same as job URL query) |
| BS2-2 | **MEDIUM** | `removeBlacklistEntry` uses `findUnique(id)` then checks userId separately (ADR-015 violation) | Changed to `findFirst({ id, userId })` |

## Session S1a Allium Weed Findings (2026-04-01) — ALL FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| WEED-1 | **MEDIUM** | BaseCombobox missing `aria-expanded` and `type="button"` on trigger | Added both attributes (`base-combobox.tsx`) |
| WEED-2 | **LOW** | TagInput doesn't clear input on popover close by click-outside | Added `setInputValue("")` in `onOpenChange` callback |
| WEED-3 | **LOW** | `uniqueId` duplicated in `keyboard-ux.spec.ts` (spec says defined once) | Import from shared `e2e/helpers/` instead |
| WEED-4 | **LOW** | `e2e/.auth/` missing from `.gitignore` | Added entry |
| WEED-5 | **LOW** | `api-key-resolver.ts` lastUsedAt not throttled (missed by perf fix) | Added `shouldWriteLastUsedAt()` throttle |
| WEED-6 | **LOW** | `job.actions.spec.ts` / `company.actions.spec.ts` outdated after IDOR fixes | Updated test expectations (createdBy, createdAt, resumeId) |
| WEED-7 | **LOW** | Jest picks up `.tracks/` test files (94 false failures) | Added `.tracks/` to `testPathIgnorePatterns` |
| WEED-8 | **LOW** | 19 allium specs had 26+ divergences from code | Fixed all — 4 code fixes + 15 spec updates across all 19 specs |

## Session S1a Performance Findings (2026-04-01) — ALL FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| PERF-1 | **HIGH** | `lastUsedAt` DB write on every API call / credential resolve — bottleneck under load | In-memory throttle: max 1 write per 5 min per key (`last-used-throttle.ts`) |
| PERF-2 | **HIGH** | Unbounded job URL query for dedup — loads ALL jobs from DB | Bounded to 90-day window (`runner.ts: getExistingVacancyKeys`) |
| PERF-3 | **HIGH** | Rate limiter Map grows unbounded between cleanup intervals | Added `MAX_STORE_SIZE=10000` cap with LRU eviction (`rate-limit.ts`) |

## Blind Spot Analysis (2026-04-01) — ALL FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| BS-1 | **HIGH** | `deleteResumeById()` missing ownership check | Added `findFirst` ownership verification before cascade delete |
| BS-2 | **HIGH** | `deleteFile()` missing ownership check | Added File→Resume→Profile→User ownership parameter |
| BS-3 | **HIGH** | `deleteWorkExperience()` + `deleteEducation()` missing ownership | Added relation chain ownership checks |
| BS-4 | **MED-HIGH** | `addResumeSummary()`, `addExperience()`, `addEducation()` write IDOR | Added resume ownership verification before create |
| BS-5 | **MEDIUM** | `getJobDetails()` + `getResumeById()` return File.filePath to client | Changed to `File: { select: { id, fileName, fileType } }` |
| BS-6 | **LOW** | Notes sub-route missing UUID validation | Added regex validation |
| BS-7 | **LOW** | File.filePath made optional in interface | `profile.model.ts` — filePath now optional |

## Security Findings — Sprint C Team Review (2026-04-01) — ALL FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| SEC-11 | **HIGH** | File.filePath exposed in API response | `File: { select: { id, fileName, fileType } }` — filePath excluded |
| SEC-12 | **HIGH** | No rate limiting for unauthenticated requests | IP-based pre-auth rate limit (120/min) added before auth check |
| SEC-13 | **MEDIUM** | `getBlacklistEntriesForUser` IDOR via server action | Moved to `src/lib/blacklist-query.ts` (server-only, no "use server") |
| SEC-14 | **MEDIUM** | `matchType` not runtime-validated | `VALID_MATCH_TYPES` array check before DB insert |
| SEC-15 | **MEDIUM** | Job ID not UUID-validated | Regex `/^[0-9a-f-]{36}$/i` on all route params |
| SEC-16 | **MEDIUM** | In-memory rate limiter multi-instance weakness | Documented in code + rate-limit.ts header comment |
| SEC-17 | **MEDIUM** | Timing oracle in API key validation | Constant-time evaluation (keyExists + keyRevoked → single branch) |
| SEC-18 | **LOW** | Error messages may leak internal context | 500 errors sanitized to generic message before response |

## Security Audit — 2026-03-31 / 2026-04-01

| ID | Bug | Files | Severity | Fix |
|----|-----|-------|----------|-----|
| SEC-1 | **Credentials exposed in URL:** Forms lack `method="POST"` — GET fallback encodes credentials as URL params | `SigninForm.tsx`, `SignupForm.tsx` | **CRITICAL** | `method="POST"` + `action=""` + useEffect URL sanitization + middleware redirect |
| SEC-2 | **IDOR getJobDetails:** Prisma query by id only, no userId filter | `job.actions.ts` | **HIGH** | `findFirst` with `userId: user.id` |
| SEC-3 | **IDOR updateJob:** Prisma update where has only id, auth check trusts client userId | `job.actions.ts` | **HIGH** | Added `userId: user.id` to Prisma where, removed client userId trust |
| SEC-4 | **IDOR getResumeById:** No ownership chain filter | `profile.actions.ts` | **HIGH** | `findFirst` with `profile: { userId: user.id }` |
| SEC-5 | **IDOR resume sub-resources:** 6 functions (addContactInfo, updateContactInfo, editResume, updateResumeSummary, updateExperience, updateEducation) missing ownership checks | `profile.actions.ts` | **HIGH** | Pre-flight ownership verification via relation chain |
| SEC-6 | **IDOR getCompanyById:** No createdBy filter | `company.actions.ts` | **HIGH** | `findFirst` with `createdBy: user.id` |
| SEC-7 | **Ephemeral AUTH_SECRET:** Docker generates new secret on every restart, invalidating all sessions | `docker-entrypoint.sh` | **HIGH** | Fail startup if AUTH_SECRET not set |
| SEC-8 | **User enumeration via signup:** Distinct error message reveals registered emails | `auth.actions.ts` | **MEDIUM** | Generic error message |
| SEC-9 | **Ollama proxy body forwarding:** Raw client body forwarded without validation | `ollama/generate/route.ts` | **MEDIUM** | Field allowlist (model, prompt, stream, system, template, context) |
| SEC-10 | **Missing security headers:** No HSTS, Permissions-Policy | `middleware.ts` | **MEDIUM** | Added HSTS (prod), Permissions-Policy to middleware |

**Upstream reported:** Issues [#67](https://github.com/Gsync/jobsync/issues/67)–[#72](https://github.com/Gsync/jobsync/issues/72) on Gsync/jobsync.

## Critical (7) — ALL FIXED

| ID | Bug | File |
|----|-----|------|
| A1 | `handleError()` returns `undefined` for non-Error exceptions (~80 callsites) | `src/lib/utils.ts:40` |
| A2 | Path traversal in resume download API (user-supplied filePath read from disk) | `src/app/api/profile/resume/route.ts:96` |
| A3 | Toast race condition in AddJob — success fires before server response | `src/components/myjobs/AddJob.tsx:149` |
| A4 | API route handlers return `undefined` on non-Error exceptions | `src/app/api/profile/resume/route.ts:65,138` |
| A5 | CSV export error response never sent to client (dead code) | `src/app/api/jobs/export/route.ts:82` |
| B1 | NEXTAUTH_URL=localhost:3000 but server runs on :3737 | `.env:9` |
| -- | Prisma engines missing after /tmp clear | FIXED in Stage 1 |

## High (9) — ALL FIXED

| ID | Bug | File |
|----|-----|------|
| A6 | Loose equality (`!=`) for authorization checks | `job.actions.ts:337`, `company.actions.ts:162` |
| A7 | Non-null assertion on potentially undefined params | `profile.actions.ts:250` |
| A8 | Redundant non-null assertion after null check | `profile.actions.ts:220` |
| A9 | `path.join(filePath)` is a no-op, does not sanitize | `resume/route.ts:106` |
| A10 | Hardcoded PBKDF2 salt for API key encryption | `encryption.ts:15` |
| B2 | `/api/eures/occupations` missing auth check | `eures/occupations/route.ts` |
| B3 | `/api/jobs/export` missing auth check | `jobs/export/route.ts` |
| C11 | `new Date()` in render path causes hydration mismatch | `JobDetails.tsx:93`, `MyJobsTable.tsx:130` |
| C14 | No error boundaries at any app level | `src/app/error.tsx` MISSING |

## Medium (19) — ALL FIXED

| ID | Bug | File |
|----|-----|------|
| A11 | Salary range data has gaps (110K-120K, 140K-150K missing) | `salaryRangeData.ts:12` |
| A12 | Hardcoded "Note deleted successfully" not translated | `NotesCollapsibleSection.tsx:110` |
| A13 | Unused import: NextApiRequest | `utils.ts:4` |
| A14 | DownloadFileButton has `any` typed parameter | `DownloadFileButton.tsx:4` |
| A15 | Unsanitized user content rendered as HTML (XSS risk) — needs DOMPurify | `QuestionCard.tsx:94` |
| A16 | Dead example file shipped in source | `route.example.ts` |
| A17 | Unused userId variable (ownership check missing) | `resume/route.ts:15,82` |
| B4 | DeepSeek models API returns 500 instead of 401 | `deepseek/models/route.ts` |
| B5 | Missing ENCRYPTION_KEY in .env | `.env` |
| B6 | Middleware only protects /dashboard, not /api/* | `middleware.ts` |
| C1 | EuresLocationCombobox: 6+ hardcoded English strings | `EuresLocationCombobox.tsx` |
| C2 | EuresOccupationCombobox: 10+ hardcoded English strings | `EuresOccupationCombobox.tsx` |
| C3 | Admin containers (3) use hardcoded Loading/Load More | `CompaniesContainer` etc. |
| C4 | "Error!" hardcoded in 12+ toast calls | Multiple components |
| C5 | Hardcoded English success messages in 9+ toasts | Multiple components |
| C6 | SupportDialog entirely untranslated | `SupportDialog.tsx` |
| C9 | `.replace("Last ", "")` English-specific manipulation | `TopActivitiesCard.tsx`, `NumberCardToggle.tsx` |
| C13 | useMemo missing locale dependency | `ActivityForm.tsx:53` |
| C15 | ESCO combobox buttons missing aria-labels | `EuresOccupationCombobox.tsx` |

## Low (14) — ALL FIXED

| ID | Bug | Fix |
|----|-----|-----|
| A18 | Promise any return types on ~80 server actions | Typed all 7 remaining with proper Prisma model types |
| A19 | 5x `as any` casts suppress type checking | Replaced with proper type assertions (`Resume`, `JobResponse`) and removed unnecessary casts |
| A20 | Commented-out time validation allows NaN | Validation restored (throws on invalid time) |
| A21 | 50+ console.log calls in production code | Gated with `debugLog()` utility + Developer Settings UI toggle |
| A22 | Typo: "no user privilages" | Fixed to "no user privileges" |
| A23 | Variable typo: comapnies | Fixed to companies |
| B7 | Ollama verify endpoint potential SSRF | URL validation + defense-in-depth at 3 layers |
| C7 | AuthCard hardcoded subtitle | Translated |
| C8 | TagInput hardcoded fallback error message | Translated |
| C10 | NumberCardToggle hardcoded aria-label | Translated |
| C12 | SupportDialog year hydration risk | Fixed |
| C16 | InfoTooltip button missing aria-label | Added |
| C17 | DownloadFileButton called as function not JSX | Fixed |
| C18 | DownloadFileButton silent failure | Fixed |

## Open — Reported 2026-03-25

**Total: 17 new issues (4 bugs, 8 UX improvements, 5 data gaps)**

### Bugs

| ID | Bug | File | Severity | Status |
|----|-----|------|----------|--------|
| D1 | Tiptap SSR: missing `immediatelyRender: false` causes hydration mismatch | `TiptapEditor.tsx`, `TipTapContentViewer.tsx` | Medium | ✅ Fixed |
| D2 | DialogContent missing `Description` or `aria-describedby` — console warnings | 22 Dialog components | Low | ✅ Fixed |
| D3 | Activity: time validation hardcoded to AM/PM, ignores user locale (DE/FR/ES expect 24h) | `ActivityForm.tsx` | Medium | ✅ Fixed |
| D4 | Activity: duration shows "47 h 5 min" — max 8h validation not enforced in UI | `ActivityForm.tsx` | Medium | ✅ Fixed |

### UX Improvements

| ID | Issue | File | Severity | Status |
|----|-------|------|----------|--------|
| D5 | Add Job: Job Source dropdown missing connector module items | `AddJob.tsx` | Medium | ✅ Fixed |
| D6 | Automations: JSearch option not grayed out when API key missing, no warning | `AutomationWizard.tsx` | Medium | ✅ Fixed |
| D7 | Automations Step 4: no option to disable LLM threshold (collect-only mode) | `AutomationWizard.tsx` | Low | ✅ Fixed |
| D8 | Automations Step 5: limited runtime options (only daily) | `AutomationWizard.tsx` | Low | ✅ Fixed |
| D9 | Automations table: keywords not as chips, locations not resolved (de1,de3), run text not harmonized, div not fully clickable, 3-dot menu | `AutomationList.tsx` | Medium | ✅ Fixed |
| D10 | Admin table: 3-dot menu instead of shared visible buttons pattern | Admin components | Low | ✅ Fixed |
| D11 | Admin New Company: no image upload, no URL preview, no SVG/vector support | `AddCompany.tsx` | Low | ✅ Fixed |
| D12 | Profile cards: 4x hardcoded "Edit" string not translated | Profile cards | Low | ✅ Fixed |

### Data Gaps

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| D13 | Mock data insufficient for all screens | Low | ✅ Fixed |
| D14 | No mock data for connectors/modules | Low | ✅ Fixed |
| D15 | All modals: Tab into Combobox/Select fields should allow typing + Enter to add | Multiple modals | Medium | ✅ Fixed — Enter/Tab/Escape handlers on all 4 combobox variants, ARIA live regions, design-reviewed |
| D16 | AddCompany: Logo URL validation too strict — rejects valid URLs like Wikipedia SVG links | `AddCompany.tsx` | Medium | ✅ Fixed |
| D17 | AddCompany: Typo "Unterstutze Formate" — missing ü → "Unterstützte Formate" | `admin.ts` i18n | Low | ✅ Fixed |

## Open — Reported 2026-03-26 (Edge-Case Testing)

**Total: 5 new issues (2 major, 1 minor, 2 low)**

### Bugs

| ID | Bug | File | Severity | Status |
|----|-----|------|----------|--------|
| E1 | React controlled/uncontrolled input error — incomplete defaultValues in useForm (missing empty strings for title, company, location, source, jobUrl, jobDescription, resume) | `AddJob.tsx:112-120`, `AddContactInfo.tsx:51-56` | Medium | ✅ Fixed |
| E2 | Activity "Invalid time format" pageerror — combineDateAndTime throws in Zod refine without try-catch, propagates as uncaught browser error | `addActivityForm.schema.ts:85-86,100-101`, `utils.ts:82` | Medium | ✅ Fixed |
| E3 | No max-length validation on job title and company name fields — accepts >255 chars without error | `addJobForm.schema.ts`, `addCompanyForm.schema.ts` | Low | ✅ Fixed |
| E4 | TagInput trigger button has no programmatic label association — `role="combobox"` not connected to FormLabel via htmlFor/id | `TagInput.tsx:109` | Low | ✅ Fixed |
| E5 | Job Source combobox missing FormControl wrapper — breaks label-to-control association unlike Title/Company/Location comboboxes | `AddJob.tsx:415` | Low | ✅ Fixed |
