import { classifyConsoleErrors } from "../e2e/helpers/console-oracle";

/**
 * Regression guard for the E2E console oracle's classifier.
 *
 * The classifier lives under `e2e/` but is unit-tested from here on purpose:
 * `jest.config.ts:214-218` stops Jest FINDING tests in `e2e/`, not importing
 * from it, and the classifier is the one half of the oracle with no Playwright
 * dependency. If this import ever starts dragging `@playwright/test` into the
 * jsdom worker, the module has grown a dependency it must not have.
 *
 * The React strings below are copied out of the bundles in `node_modules`
 * (path and line in each fixture's comment), not paraphrased. Some are
 * TRUNCATED — the tail of a hydration diff is unbounded — but never reworded,
 * and never before the point the predicates read. A paraphrase would test this
 * file's idea of the message instead of React's, which is precisely the
 * failure mode an anchored predicate exists to prevent.
 */

/**
 * React DEV build, attribute-level hydration mismatch. This is the shape
 * E2E-B11 measured twice (`/tmp/e2e-extract-3.log:159`,
 * `/tmp/e2e-crud-run-1788275468.log:153`), including the literal `%s%s` —
 * Playwright hands the console listener the UNSUBSTITUTED format string with
 * the arguments appended after it.
 *
 * Source: node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:4707
 */
const DEV_HYDRATION_ATTRIBUTE_WARNING = [
  "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:",
  "",
  "- A server/client branch `if (typeof window !== 'undefined')`.",
  "- Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.",
  "- Date formatting in a user's locale which doesn't match the server.",
  "- External changing data without sending a snapshot of it along with the HTML.",
  "- Invalid HTML tag nesting.",
  "",
  "It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.",
  "",
  "%s%s https://react.dev/link/hydration-mismatch ",
  "",
  "  ...",
  "    <RootLayout>",
  "      <ActivityProvider>",
].join("\n");

/**
 * React DEV build, a mismatch severe enough to throw. Reaches the oracle via
 * `page.on("pageerror")` as `err.message`.
 *
 * Source: node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:4506-4508
 */
const DEV_HYDRATION_THROWN =
  "Hydration failed because the server rendered HTML didn't match the client. " +
  "As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:\n\n" +
  "- A server/client branch `if (typeof window !== 'undefined')`.\n" +
  "- Invalid HTML tag nesting.\n\n" +
  "https://react.dev/link/hydration-mismatch";

/** The `fromText` variant of the same throw. Same file, same line. */
const DEV_HYDRATION_THROWN_TEXT =
  "Hydration failed because the server rendered text didn't match the client. " +
  "As a result this tree will be regenerated on the client.";

/**
 * React PRODUCTION build. `throwOnHydrationMismatch` builds error 418 through
 * `formatProdErrorMessage`, and the message below is that function's output
 * assembled literally.
 *
 * Source: node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js:18-31, :2739-2748
 */
const PROD_HYDRATION_ERROR =
  "Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= " +
  "for the full message or use the non-minified dev environment for full errors " +
  "and additional helpful warnings.";

/** The recoverable-hydration wrapper, same production shape, different code. */
const PROD_HYDRATION_RECOVERED =
  "Minified React error #423; visit https://react.dev/errors/423 " +
  "for the full message or use the non-minified dev environment for full errors " +
  "and additional helpful warnings.";

describe("classifyConsoleErrors", () => {
  describe("development-build hydration noise", () => {
    it("buckets the attribute-mismatch warning as framework noise, not app", () => {
      const { app, transport, frameworkHydration } = classifyConsoleErrors([
        DEV_HYDRATION_ATTRIBUTE_WARNING,
      ]);

      expect(app).toEqual([]);
      expect(transport).toEqual([]);
      expect(frameworkHydration).toEqual([DEV_HYDRATION_ATTRIBUTE_WARNING]);
    });

    it("buckets the thrown HTML mismatch as framework noise", () => {
      const { app, frameworkHydration } = classifyConsoleErrors([
        DEV_HYDRATION_THROWN,
      ]);

      expect(app).toEqual([]);
      expect(frameworkHydration).toEqual([DEV_HYDRATION_THROWN]);
    });

    it("buckets the thrown TEXT mismatch as framework noise", () => {
      const { app, frameworkHydration } = classifyConsoleErrors([
        DEV_HYDRATION_THROWN_TEXT,
      ]);

      expect(app).toEqual([]);
      expect(frameworkHydration).toEqual([DEV_HYDRATION_THROWN_TEXT]);
    });

    it("reports the noise rather than dropping it", () => {
      // The bucket exists so `sinceMark` can warn about it. A classifier that
      // returned only `app` would satisfy every assertion above and still be
      // the silent-suppression bug this replaces.
      const { frameworkHydration } = classifyConsoleErrors([
        DEV_HYDRATION_ATTRIBUTE_WARNING,
        DEV_HYDRATION_THROWN,
      ]);

      expect(frameworkHydration).toHaveLength(2);
    });
  });

  describe("production-build hydration errors still fail", () => {
    it("keeps the minified #418 form in app", () => {
      const { app, frameworkHydration } = classifyConsoleErrors([
        PROD_HYDRATION_ERROR,
      ]);

      expect(app).toEqual([PROD_HYDRATION_ERROR]);
      expect(frameworkHydration).toEqual([]);
    });

    it("keeps the minified #423 form in app", () => {
      const { app, frameworkHydration } = classifyConsoleErrors([
        PROD_HYDRATION_RECOVERED,
      ]);

      expect(app).toEqual([PROD_HYDRATION_RECOVERED]);
      expect(frameworkHydration).toEqual([]);
    });

    it("keeps an unknown error code in app — the rule is not an allowlist", () => {
      const future =
        "Minified React error #999; visit https://react.dev/errors/999";

      expect(classifyConsoleErrors([future]).app).toEqual([future]);
    });

    it("keeps a bare react.dev/errors link in app even without the prefix", () => {
      // The prefix is what `formatProdErrorMessage` emits, but a wrapper that
      // only carried the link would otherwise fall through to the suppression
      // rules. The link predicate is deliberately unanchored.
      const wrapped =
        "Error: something rethrew this — see https://react.dev/errors/418?args[]=HTML";

      expect(classifyConsoleErrors([wrapped]).app).toEqual([wrapped]);
    });

    it("the production guard wins over every suppression rule", () => {
      // Reading order is the guarantee: nothing after the guard may reclassify
      // a production React error, no matter what else the message contains.
      const mixed =
        "Minified React error #418; visit https://react.dev/errors/418 — " +
        "Failed to fetch favicon, status of 404";

      const { app, transport, frameworkHydration } = classifyConsoleErrors([
        mixed,
      ]);

      expect(app).toEqual([mixed]);
      expect(transport).toEqual([]);
      expect(frameworkHydration).toEqual([]);
    });
  });

  describe("application errors that merely mention the trigger words", () => {
    it("keeps an app error containing the word hydration in app", () => {
      const appError =
        "TypeError: Cannot read properties of undefined (reading 'hydration')";

      expect(classifyConsoleErrors([appError]).app).toEqual([appError]);
    });

    it("keeps an app error whose prose starts with Hydration but is not React's", () => {
      // Anchored, not a substring: the predicate requires React's exact
      // continuation, so a message that only opens the same way still fails.
      const appError =
        "Hydration failed because the resume parser returned no sections";

      expect(classifyConsoleErrors([appError]).app).toEqual([appError]);
    });

    it("keeps an app error embedding a 404 status in app (E2E-B28)", () => {
      // `src/app/api/profile/resume/route.ts:112` answers `File not found`
      // with a 404; a client-side report of it is a product signal.
      const appError = "Failed to load resume: File not found (404)";

      expect(classifyConsoleErrors([appError]).app).toEqual([appError]);
    });
  });

  describe("transport and resource rules are unchanged", () => {
    it("buckets net::ERR_* as transport", () => {
      const err = "Failed to load resource: net::ERR_CONNECTION_RESET";
      const { app, transport } = classifyConsoleErrors([err]);

      expect(app).toEqual([]);
      expect(transport).toEqual([err]);
    });

    it("buckets a bare Failed to fetch as transport", () => {
      const err = "Failed to fetch";

      expect(classifyConsoleErrors([err]).transport).toEqual([err]);
    });

    it("buckets a TypeError-prefixed Failed to fetch as transport", () => {
      const err = "TypeError: Failed to fetch";

      expect(classifyConsoleErrors([err]).transport).toEqual([err]);
    });

    it("drops Chromium's own 404 resource message entirely", () => {
      const err =
        "Failed to load resource: the server responded with a status of 404 (Not Found)";
      const { app, transport, frameworkHydration } = classifyConsoleErrors([
        err,
      ]);

      expect(app).toEqual([]);
      expect(transport).toEqual([]);
      expect(frameworkHydration).toEqual([]);
    });

    it("drops anything mentioning favicon", () => {
      const err = "Failed to load resource: /favicon.ico";

      expect(classifyConsoleErrors([err]).app).toEqual([]);
    });
  });

  describe("mixed windows", () => {
    it("splits a window into three buckets and preserves order within each", () => {
      const appA = "Uncaught TypeError: x is not a function";
      const appB = "Uncaught RangeError: invalid array length";
      const transportA = "Failed to load resource: net::ERR_CONNECTION_REFUSED";

      const { app, transport, frameworkHydration } = classifyConsoleErrors([
        appA,
        DEV_HYDRATION_ATTRIBUTE_WARNING,
        transportA,
        "Failed to load resource: the server responded with a status of 404",
        appB,
      ]);

      expect(app).toEqual([appA, appB]);
      expect(transport).toEqual([transportA]);
      expect(frameworkHydration).toEqual([DEV_HYDRATION_ATTRIBUTE_WARNING]);
    });

    it("returns three empty buckets for an empty window", () => {
      expect(classifyConsoleErrors([])).toEqual({
        app: [],
        transport: [],
        frameworkHydration: [],
      });
    });
  });
});
