/**
 * Shared plaintext for the Public API key seeded for Job E2E teardown.
 *
 * Imported by BOTH `prisma/seed-e2e.ts` (inserts the `PublicApiKey` row whose
 * `keyHash` this plaintext must hash to) and `e2e/helpers/job-fixture.ts`
 * (sends this plaintext as the `Authorization: Bearer` header). The two
 * processes never talk to each other directly — this file is the only thing
 * that has to agree between them.
 *
 * NOT an env var, deliberately. `prisma/seed-e2e.ts` runs once, against a
 * cached, hash-keyed template (`scripts/e2e-db.sh`); Playwright runs later, in
 * a separate process, against a copy of that template — possibly minutes,
 * hours or days after the template was built, via any of several invocation
 * paths (`test-e2e.sh`, `--ui`, watch mode, a bare `playwright test`). An env
 * var would require every one of those paths to independently export the same
 * value at the same time the template was built; because the template is
 * cached, a "freshly regenerated" value would be a correctness bug, not just
 * an inconvenience. A source-literal constant has no invocation-order
 * dependency: whoever runs the seed and whoever runs Playwright import the
 * same file from the same commit, unconditionally.
 *
 * Fixed forever, not rotated per run: unlike `TEST_USER_EMAIL` or
 * `"E2E Activity Type"` (duplicated as literals in two places each, safe to
 * duplicate because a mismatch fails visibly or degrades to an extra row), a
 * wrong hex digit here produces a syntactically valid, silently wrong key,
 * indistinguishable by eye, that fails every single teardown call with a 401.
 * A shared constant removes the class of bug a duplicated literal would risk.
 *
 * Generated once via the real `generateApiKey()` shape
 * (`pk_live_` + 20 random bytes as hex, `src/lib/api/auth.ts:83-86`) and
 * hardcoded — this is test fixture data, not a runtime secret, and there is
 * nothing to rotate: it only ever exists inside the disposable E2E template
 * database (`prisma/.e2e-template.db` / `.e2e-run.db`), never in a real
 * deployment.
 */
export const E2E_JOB_TEARDOWN_API_KEY =
  "pk_live_648a3aec7b0b4c5c97c28033dabe7055d138c7bc";
