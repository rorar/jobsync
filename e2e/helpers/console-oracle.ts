/**
 * The console-error oracle's CLASSIFIER, pulled out of
 * `e2e/crud/keyboard-ux.spec.ts` so a unit test can reach it.
 *
 * THIS FILE MUST NOT IMPORT `@playwright/test`, OR ANY MODULE THAT DOES.
 * `__tests__/console-oracle.spec.ts` imports it under Jest, and
 * `jest.config.ts:214-218` only stops Jest FINDING tests inside `e2e/` — it
 * does nothing to stop a test IMPORTING from there. A Playwright import would
 * pull the runner into a jsdom worker that has no business hosting it. The
 * half of the oracle that genuinely needs `Page` — `collectConsoleErrors`,
 * which attaches the two listeners and owns the observation window — stays in
 * the spec for exactly that reason, and calls in here.
 */

/**
 * Split a console-error window into what the APPLICATION did, what the
 * HARNESS did, and what the FRAMEWORK said about a tree it built itself.
 * Only the first third may fail a test.
 *
 * WHY THE TRANSPORT THIRD MUST NOT FAIL A TEST — MEASURED, NOT ASSUMED
 * --------------------------------------------------------------------
 * On the 2026-09-05 full run, "Enter key creates a new option in Title
 * combobox" failed at this oracle with eight entries, every one of them
 * `Failed to load resource: net::ERR_CONNECTION_RESET` or `…_REFUSED`. The
 * behaviour under test had already passed: the trigger showed the created
 * title and the `${title} created` announcement had landed. The cause is in
 * `/tmp/jobsync-e2e-dev.log`, one line above the second `✓ Ready in` —
 * `⚠ Server is approaching used memory threshold, restarting...`. Next.js
 * restarted ITSELF against the 3072 MB heap cap `scripts/dev-e2e.sh` sets, and
 * every request in flight failed at the socket. No kernel OOM was involved,
 * which is why looking for one found nothing.
 *
 * Three reasons that cannot be a test failure:
 *   1. `Failed to load resource: net::ERR_*` is emitted by Chromium's network
 *      stack. No application code ran to produce it, so it is not evidence
 *      about application code — which is the only thing this oracle judges.
 *   2. The restart is the dev server's DESIGNED response to its own heap
 *      threshold. That makes it a recurring property of the harness, not an
 *      accident, and an oracle that fails on it makes every long run randomly
 *      red at an arbitrary test.
 *   3. It lands on whichever test is mid-flight — the most misleading failure
 *      shape available: a green behaviour reported as a code defect at a
 *      file:line unrelated to the cause. Triaging that costs a full cycle and
 *      teaches the team that the oracle is noise, which is how an oracle gets
 *      deleted. This one exists because real console errors were being missed.
 *
 * They are still REPORTED — `sinceMark` warns them to stdout, which Playwright
 * copies into the JSON report — because an oracle that silently discards the
 * inconvenient half is worse than no oracle at all. The framework-hydration
 * third below is reported the same way, for the same reason.
 *
 * WHY EVERY PREDICATE IS ANCHORED RATHER THAN A SUBSTRING (E2E-B28)
 * -----------------------------------------------------------------
 * What this replaces was three bare substrings — `favicon`, `404`,
 * `Failed to fetch` — added in `9a891c32e` (2026-03-26) with no recorded
 * reason and never edited since. `404` was the dangerous one: as a substring
 * it also suppresses a GENUINE application error whose message embeds the
 * status, and this app writes several (`api/logos/[id]/route.ts:67,96,102`,
 * `api/profile/resume/route.ts:112`). Each rule below is anchored to the shape
 * of a message the BROWSER emits, so an application error that merely mentions
 * 404 now fails the test, as it always should have.
 *
 * Provenance, since the finding was that none was recorded: the `net::ERR_`
 * rule is measured, above. The other two are RECONSTRUCTED intent. They are
 * therefore written to suppress strictly less than the substrings did, never
 * more — the reconstruction can be wrong in the direction of noise, not in the
 * direction of silence.
 *
 * WHY A DEVELOPMENT BUILD'S HYDRATION REPORT IS NOT EVIDENCE ABOUT THIS APP
 * -------------------------------------------------------------------------
 * E2E-B11 (`docs/BUGS.md:86`) root-caused a hydration mismatch in the
 * dashboard chrome — three Radix `useId` values diverging between server and
 * client — to the Next.js DEV server's tree shape. Decoding the React 19 tree
 * ids gave `server_upper = client_upper * 4 + 2` for all three components:
 * exactly one extra 2-or-3-child array fork on the SERVER, at a position
 * immediately ABOVE `src/app/dashboard/layout.tsx`'s default export, where the
 * only app-owned nodes are two single-child providers that cannot produce a
 * fork. It reddened this file twice with byte-identical ids —
 * `/tmp/e2e-extract-3.log:159` ("Enter adds a keyword as chip, popover stays
 * open") and `/tmp/e2e-crud-run-1788275468.log:153` ("Rapid type + Enter
 * before ESCO results load does not crash") — at roughly one dev run in three,
 * and never once in a production sample.
 *
 * THE TWO MESSAGE SHAPES ARE DISTINGUISHABLE BY CONSTRUCTION, NOT BY GUESS
 * ------------------------------------------------------------------------
 * React ships two builds and they do not say the same thing. Only the
 * DEVELOPMENT build carries prose (verified 2026-09-08 against
 * `react-dom` 19.2.4 as bundled by `next` 15.5.10):
 *
 *   node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js
 *     :4707  console.error("A tree hydrated but some attributes of the server
 *            rendered HTML didn't match the client properties. …%s%s",
 *            "https://react.dev/link/hydration-mismatch", diff)
 *     :4506  Error("Hydration failed because the server rendered " +
 *            (fromText ? "text" : "HTML") + " didn't match the client. …")
 *
 * The PRODUCTION build replaces both with a numbered stub:
 *
 *   node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js
 *     :2739  throwOnHydrationMismatch → Error(formatProdErrorMessage(418, …))
 *     :18-31 formatProdErrorMessage → "Minified React error #" + code +
 *            "; visit https://react.dev/errors/" + code + " for the full
 *            message or use the non-minified dev environment for full errors
 *            and additional helpful warnings."
 *
 * Both prose strings occur ONLY in files named `*.development.js` — checked
 * across `node_modules/react-dom/cjs/` and both of Next's compiled copies
 * (`compiled/react-dom/`, `compiled/react-dom-experimental/`); the production
 * and profiling builds carry neither, and `react-dom-client.production.js`
 * contains zero occurrences of `hydration-mismatch`. So a predicate anchored
 * on the prose is dev-only BY CONSTRUCTION and needs no environment variable
 * to be correct — which matters, because `E2E_PROD` "describes this run's
 * INTENT and not its server" whenever `E2E_REUSE_SERVER=1` is in play
 * (`scripts/test-e2e.sh:333`). Reading a flag would have been wrong precisely
 * in the case where someone reuses a dev server under a production intent.
 *
 * Both forms reach the listeners, by different routes, which is why the
 * classifier sees them as plain strings and does not care which. The attribute
 * warning arrives on `page.on("console")` — React calls `console.error` and
 * Chromium hands Playwright the UNSUBSTITUTED format string, hence the literal
 * `%s%s` in the logs above. The thrown one goes through Next's
 * `onRecoverableError` → `reportGlobalError`
 * (`node_modules/next/dist/client/react-client-callbacks/on-recoverable-error.js:32-44`
 * and `.../report-global-error.js`), which calls `reportError()` where the
 * browser has it — an uncaught error at the window, i.e. `page.on("pageerror")`
 * — and falls back to `console.error` where it does not. Either listener sees
 * the same `message`: Next's dev decoration only attaches an owner stack
 * (`next-devtools/userspace/app/errors/stitched-error.js:decorateDevError`), it
 * does not rewrite the text, so `^` anchoring holds on both paths.
 *
 * WHAT THIS COSTS, STATED PLAINLY
 * -------------------------------
 * Under a dev server the suite no longer fails on an APP-caused hydration
 * mismatch either. The message genuinely cannot tell the two apart, which is
 * why E2E-B11 left the decision to the operator instead of suppressing
 * anything on its own authority. The cost is affordable now and was not
 * before: production has been the DEFAULT since 2026-09-08
 * (`scripts/test-e2e.sh:175`, `export E2E_PROD="${E2E_PROD:-1}"`), and under a
 * production build the same defect arrives as `Minified React error #418` and
 * still fails every one of the seven assertion sites. The dev path keeps HMR
 * for spec iteration; it stops pretending to be a hydration oracle.
 *
 * If a narrower rule is ever wanted, narrow the THROWN predicate first and
 * keep the attribute one — the attribute warning is the shape E2E-B11
 * measured, and it has no production counterpart at all.
 */

/** Chromium's network stack gave up on a request. Never application code. */
const BROWSER_TRANSPORT_ERROR = /^Failed to load resource: net::ERR_/;

/** A `fetch()` that never reached a server. Same class as `net::ERR_*`. */
const FETCH_TRANSPORT_ERROR = /^(TypeError: )?Failed to fetch\b/;

/** Chromium's own message for a request the server answered with a 404. */
const BROWSER_RESOURCE_404 =
  /^Failed to load resource: the server responded with a status of 404\b/;

/**
 * React's production error stub, in either half of its shape.
 *
 * Deliberately generic over the code rather than a list of `418|423`.
 * Enumerating would not be UNSAFE — the framework rules below are anchored on
 * DEV prose, which a minified message never carries, so an unlisted code falls
 * through to `app` and still fails — but it would move the guarantee out of
 * this guard and into the exhaustiveness of the prose anchors, which is a
 * worse place to keep it. It would also rot: the numbers come from a table
 * React's build owns and does not ship into `node_modules` (no `codes.json`
 * under `react`, `react-dom` or `next` — checked), so nothing here could keep
 * a list honest across an upgrade. The link form is unanchored because it can
 * sit mid-message; the prefix form is anchored because `formatProdErrorMessage`
 * always builds it first.
 *
 * Nothing that matches either of these may be classified as noise, so both are
 * tested BEFORE the framework rules below.
 */
const REACT_PRODUCTION_ERROR = /^Minified React error #\d+\b/;
const REACT_PRODUCTION_ERROR_LINK = /https:\/\/react\.dev\/errors\/\d+/;

/**
 * React DEV build, attribute-level hydration mismatch. Reaches the oracle as a
 * `console.error`, and has no production counterpart at ALL — not a different
 * wording, nothing: `react-dom-client.production.js` contains zero occurrences
 * of `hydration-mismatch`. This is E2E-B11's measured signature.
 */
const DEV_HYDRATION_ATTRIBUTE_MISMATCH =
  /^A tree hydrated but some attributes of the server rendered HTML didn't match the client properties\b/;

/**
 * React DEV build, a hydration mismatch severe enough that React throws and
 * regenerates the subtree. Production reports the same defect as
 * `Minified React error #418`, which the guard above keeps in `app`.
 *
 * The `(HTML|text)` alternation is not a convenience: `throwOnHydrationMismatch`
 * interpolates one or the other from its `fromText` argument
 * (`react-dom-client.development.js:4506-4508`), so a bare prefix would have
 * to stop before the branch and would then also match a hypothetical future
 * message that merely starts the same way.
 */
const DEV_HYDRATION_MISMATCH_THROWN =
  /^Hydration failed because the server rendered (HTML|text) didn't match the client\b/;

export type ConsoleErrorBuckets = {
  /** Errors this suite is willing to fail a test on. */
  app: string[];
  /** The browser could not reach the server. A statement about the harness. */
  transport: string[];
  /**
   * A DEVELOPMENT React build complaining about a tree the DEV server shaped.
   * Reported, never failed. See the block comment above.
   */
  frameworkHydration: string[];
};

export function classifyConsoleErrors(errors: string[]): ConsoleErrorBuckets {
  const app: string[] = [];
  const transport: string[] = [];
  const frameworkHydration: string[] = [];

  for (const e of errors) {
    // FIRST, and deliberately so: a production React error is an application
    // failure and nothing below may reclassify it. Putting the positive guard
    // ahead of every suppression rule makes "production hydration errors still
    // fail" a property of the reading order, not of a reviewer's diligence.
    if (REACT_PRODUCTION_ERROR.test(e) || REACT_PRODUCTION_ERROR_LINK.test(e)) {
      app.push(e);
      continue;
    }
    if (BROWSER_TRANSPORT_ERROR.test(e) || FETCH_TRANSPORT_ERROR.test(e)) {
      transport.push(e);
      continue;
    }
    if (
      DEV_HYDRATION_ATTRIBUTE_MISMATCH.test(e) ||
      DEV_HYDRATION_MISMATCH_THROWN.test(e)
    ) {
      frameworkHydration.push(e);
      continue;
    }
    // A missing static asset is not an application fault. `favicon` is kept
    // from the original filter and is UNMEASURED — Playwright's `msg.text()`
    // for a resource-load failure carries no URL, so this may well match
    // nothing. It is retained rather than deleted because removing it could
    // only be justified by a run that proves it dead, and dropping it costs
    // nothing while the 404 rule above already covers the case it named.
    if (BROWSER_RESOURCE_404.test(e) || e.includes("favicon")) continue;
    app.push(e);
  }

  return { app, transport, frameworkHydration };
}
