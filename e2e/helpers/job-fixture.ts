/**
 * Job E2E teardown — API-based, called from an `auto: true` Playwright
 * fixture per spec file, not from a hand-written `afterEach`.
 *
 * Satisfies `specs/e2e-test-infrastructure.allium:868` (`FixtureOwnedTeardown`)
 * for the whole per-file cleanup chain (Job + its reference-group sweep), not
 * just the Job step. `docs/adr/045-e2e-owns-nothing-that-outlives-the-run.md`
 * deliberately deferred adopting fixtures suite-wide ("Option 2") pending
 * per-model measurement; E2E-B38/E2E-B47 (both 2026-09-09) are that measurement
 * for Job specifically — see the ADR this decision narrows for the full
 * reasoning. This does NOT apply to any other spec file.
 *
 * IMPORTANT — why this is a plain function, not itself a fixture: each spec
 * file's cleanup body sweeps a DIFFERENT set of reference groups (JobTitle/
 * Company/Location everywhere, plus JobSource in enrichment.spec.ts, plus a
 * custom JobStatus in job-status-crud.spec.ts) in a REQUIRED order — Job
 * first, because `deleteJobTitleById`/`deleteCompanyById`/`deleteJobStatus`
 * all refuse while a Job still references them. Playwright does not guarantee
 * any fixed interleaving between a standalone `afterEach` and fixture
 * teardown, and sibling fixtures with no dependency edge have no guaranteed
 * order either (confirmed against Playwright's own docs and source,
 * 2026-09-13) — so splitting "delete the Job" into its own fixture while the
 * reference sweep stayed in `afterEach` would silently break that ordering
 * every time (afterEach always runs before fixture teardown). The fix,
 * matching Playwright's own documented recommendation ("if an after-hook
 * tears down what a before-hook created, turn it into a fixture"): each spec
 * file wraps its ENTIRE existing cleanup body — Job deletion via this
 * function, then its own reference-group sweep, in the same order as
 * today — into ONE local `auto: true` fixture, replacing `test.afterEach`.
 * One function, no cross-fixture ordering to get wrong.
 *
 * Replaces five independent, drifted `deleteJobTracked`/`ensureTableView`
 * copies that deleted Jobs by clicking through the UI — the mechanism behind
 * four real bugs this session found (a view-mode false-negative, a
 * pagination edge, an aria-hidden interaction, a hydration race), because
 * each depended on DOM state a locator can misread.
 */
import type { Page } from "@playwright/test";
import { E2E_JOB_TEARDOWN_API_KEY } from "./api-key-fixture";

interface JobListItem {
  id: string;
  JobTitle: { label: string } | null;
}

interface JobsListResponse {
  success: boolean;
  data: JobListItem[];
}

const AUTH_HEADER = { Authorization: `Bearer ${E2E_JOB_TEARDOWN_API_KEY}` };

/**
 * Resolve title -> id via `GET /api/v1/jobs?search=`, then
 * `DELETE /api/v1/jobs/:id`. THROWS a specific, named error for every
 * anomaly (non-2xx at either step, 0 matches, 2+ matches, non-204 delete) —
 * callers decide whether that's a hard failure or a logged warning; the
 * convention in this suite's cleanup fixtures is to catch-and-warn (see
 * `__tests__/e2e-no-swallowed-assertions.spec.ts`'s sanctioned
 * `swallow-ok: cleanup net` shape) and let `scripts/check-e2e-residue.sh`
 * be the hard backstop for a genuine leak.
 *
 * `search` OR-matches JobTitle/Company/Location/description with `contains`
 * (`src/app/api/v1/jobs/route.ts:43-50`), so the result is filtered to an
 * exact, case-insensitive `JobTitle.label` match before trusting it —
 * defensive, not required by any test-data collision observed today (every
 * title/company/location in this suite carries a different literal prefix
 * from `uniqueId()`).
 */
export async function deleteJobViaApi(page: Page, title: string): Promise<void> {
  const searchRes = await page.request.get(
    `/api/v1/jobs?search=${encodeURIComponent(title)}&perPage=25`,
    { headers: AUTH_HEADER },
  );
  if (!searchRes.ok()) {
    throw new Error(
      `[job-fixture] search failed for "${title}" (${searchRes.status()}): ${await searchRes.text()}`,
    );
  }

  const body = (await searchRes.json()) as JobsListResponse;
  const matches = (body.data ?? []).filter(
    (job) => job.JobTitle?.label.toLowerCase() === title.toLowerCase(),
  );

  if (matches.length === 0) {
    throw new Error(
      `[job-fixture] 0 exact matches for "${title}" — job never existed or already gone`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `[job-fixture] ${matches.length} exact matches for "${title}" — expected exactly 1`,
    );
  }

  const jobId = matches[0].id;
  const deleteRes = await page.request.delete(`/api/v1/jobs/${jobId}`, {
    headers: AUTH_HEADER,
  });
  if (deleteRes.status() !== 204) {
    throw new Error(
      `[job-fixture] DELETE /api/v1/jobs/${jobId} for "${title}" returned ` +
        `${deleteRes.status()} (expected 204): ${await deleteRes.text()}`,
    );
  }
}
