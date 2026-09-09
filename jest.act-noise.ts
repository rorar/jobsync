/**
 * The one React message this project filters out of test output, and the
 * reasoning for doing it. Kept in its own module so that
 * `__tests__/act-noise-filter.spec.ts` can check the string still matches what
 * React actually prints — a filter that silently stops matching is a filter
 * that quietly stops working.
 *
 * WHERE IT COMES FROM. React 19's `isConcurrentActEnvironment`
 * (node_modules/react-dom/cjs/react-dom-client.development.js:16322-16333)
 * prints this when `IS_REACT_ACT_ENVIRONMENT` is falsy AND
 * `ReactSharedInternals.actQueue` is non-null — that is, "you are inside an
 * act() scope, but the global flag says this environment is not act-aware".
 *
 * WHY IT FIRES HERE, in 829 of 895 console.error lines across a five-suite run.
 * Testing Library sets that flag `true` for every suite that imports it
 * (@testing-library/react/dist/index.js:41-51) and then deliberately sets it
 * back to `false` for the duration of every `waitFor` / `findBy*`
 * (dist/pure.js:81-86, whose own comment reads "We just want to run `waitFor`
 * without IS_REACT_ACT_ENVIRONMENT"). Any React work that overlaps a `waitFor`
 * therefore meets exactly the printing condition. It is a disagreement between
 * two libraries about bookkeeping, not a defect in this codebase — and setting
 * the flag in `jest.setup.ts` cannot fix it, because RTL overwrites it later
 * and then unsets it on purpose.
 *
 * WHY SILENCING IT HIDES NOTHING. The real warning — "An update to %s inside a
 * test was not wrapped in act(...)" — is guarded by
 * `isConcurrentActEnvironment() && null === actQueue`
 * (react-dom-client.development.js:18754-18763). It needs the flag TRUTHY and
 * the queue EMPTY; this message needs the flag FALSY and the queue NON-EMPTY.
 * The two conditions are complementary, so a suppressed line here is never a
 * genuine act() violation that would otherwise have been reported.
 */
export const ACT_ENVIRONMENT_NOISE =
  "The current testing environment is not configured to support act(...)";
