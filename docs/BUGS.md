# Bug Tracker — Collected 2026-03-24, Updated 2026-04-01

**Total: 89 bugs found, 81 fixed, 8 open (security)**

### Status: ⚠️ 8 open security findings from Sprint C Team Review

## Security Findings — Sprint C Team Review (2026-04-01)

| ID | Severity | Finding | File | Status |
|----|----------|---------|------|--------|
| SEC-11 | **HIGH** | **File.filePath exposed in API response:** GET /api/v1/jobs/:id includes `Resume: { include: { File: true } }` — returns full server filesystem path to external API consumers | `src/app/api/v1/jobs/[id]/route.ts:26` | OPEN |
| SEC-12 | **HIGH** | **No rate limiting for unauthenticated requests:** `withApiAuth` applies rate limiting only after successful auth — invalid/missing API key requests bypass rate limiter entirely, enabling DB-level DoS via unbounded `findUnique` lookups | `src/lib/api/with-api-auth.ts:44` | OPEN |
| SEC-13 | **MEDIUM** | **`getBlacklistEntriesForUser` exposed as server action without auth:** Exported from `"use server"` file with raw userId param — any client can call it with arbitrary userId to read other users' blacklist patterns (IDOR) | `src/actions/companyBlacklist.actions.ts:128` | OPEN |
| SEC-14 | **MEDIUM** | **`matchType` parameter not runtime-validated:** TypeScript union `"exact" \| "contains"` erased at runtime — attacker can pass arbitrary string values via server action, stored in DB | `src/actions/companyBlacklist.actions.ts:43` | OPEN |
| SEC-15 | **MEDIUM** | **Job ID path parameter not UUID-validated:** Route params used directly in Prisma queries without format check — malformed/large strings hit DB unnecessarily, increases DoS surface | `src/app/api/v1/jobs/[id]/route.ts:13` | OPEN |
| SEC-16 | **MEDIUM** | **In-memory rate limiter ineffective in multi-instance deployments:** Each process maintains independent rate limit state — rate limits become N× weaker with N instances | `src/lib/api/rate-limit.ts:8` | OPEN — documented, accepted for self-hosted |
| SEC-17 | **MEDIUM** | **Timing oracle in API key validation:** Response timing differs between "key not found", "key revoked", and "key valid" paths — enables key state enumeration by timing analysis | `src/lib/api/auth.ts:21-29` | OPEN — low risk (SHA-256 makes brute-force infeasible) |
| SEC-18 | **LOW** | **Error messages in `inferErrorStatus` may leak internal context:** String-matching on error messages could forward Prisma/internal error details to API consumers | `src/lib/api/response.ts:112` | OPEN — mitigated by global error handler |

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
