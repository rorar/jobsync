/**
 * @jest-environment node
 *
 * Invariant: an E2E test may not swallow its own assertions.
 *
 * `try { …expect(…)… } catch { console.log("Note: …") }` produces a test that
 * passes while exercising nothing. E2E-B27: at keyboard-ux.spec.ts:712-727 the
 * whole selection block sits in such a try, so when the option never appears
 * every functional assertion is skipped and the console-error oracle at :729 is
 * the only surviving assertion — green, and measuring the absence of console
 * errors on a page nobody interacted with.
 *
 * This converts a doc-comment convention into a checked invariant, the same
 * move `__tests__/pii-redaction.spec.ts` makes for the PII leaf and
 * `scripts/check-notification-writers.sh` for the notification writers.
 *
 * Spec: specs/e2e-test-infrastructure.allium — ConsoleOracleIsNeverTheOnlyAssertion.
 *
 * WHY THE OPT-OUT LIVES AT THE SITE, NOT IN A LIST HERE
 * ----------------------------------------------------
 * Some catches SHOULD swallow: the afterEach cleanup nets deliberately do, so a
 * hook cannot replace a real test failure with its own. A path+line allowlist in
 * this file would drift the first time anyone edits those specs, and its reasons
 * would live a directory away from the code they excuse. So the opt-out is a
 * marker comment on the catch itself:
 *
 *     } catch {
 *       // swallow-ok: cleanup net — a throwing hook would mask the real failure
 *     }
 *
 * The reason is required, and it is read by whoever next looks at the catch.
 *
 * DELIBERATELY A HEURISTIC, AND DELIBERATELY IN JEST
 * -------------------------------------------------
 * Brace matching, not a TypeScript parse: cheap, and the shape it looks for is
 * lexical. It runs in Jest because `bun run test` runs in CI (ci.yml) and
 * Playwright does not — a check that can run automatically should.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const E2E_DIR = join(__dirname, "..", "e2e");
const OPT_OUT = /swallow-ok:/;

function specFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...specFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Index of the `}` closing the block that opens at `openBrace`. */
function matchBrace(src: string, openBrace: number): number {
  let depth = 0;
  for (let i = openBrace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface Offender {
  file: string;
  line: number;
}

function findSwallowedAssertions(src: string, relPath: string): Offender[] {
  const offenders: Offender[] = [];
  const tryRe = /\btry\s*\{/g;

  for (const m of src.matchAll(tryRe)) {
    const openBrace = src.indexOf("{", m.index!);
    const closeBrace = matchBrace(src, openBrace);
    if (closeBrace === -1) continue;

    const tryBody = src.slice(openBrace + 1, closeBrace);
    // Only try blocks that ASSERT are interesting. A try around a best-effort
    // click that asserts nothing has nothing to swallow.
    if (!tryBody.includes("expect(")) continue;

    // The catch clause follows, optionally binding an error.
    const after = src.slice(closeBrace + 1);
    const catchMatch = /^\s*catch\s*(\([^)]*\)\s*)?\{/.exec(after);
    if (!catchMatch) continue; // try/finally without catch cannot swallow

    const catchOpen = closeBrace + 1 + after.indexOf("{", catchMatch.index);
    const catchClose = matchBrace(src, catchOpen);
    if (catchClose === -1) continue;
    const catchBody = src.slice(catchOpen + 1, catchClose);

    const rethrows = /\bthrow\b/.test(catchBody);
    const asserts = catchBody.includes("expect(");
    const optedOut = OPT_OUT.test(catchBody);
    // A skip is an honest outcome: the run reports the test as NOT RUN. A
    // console.log is not — it reports the test as passed. That difference is
    // the whole point of this check, so `test.skip()` is accepted and logging
    // is not.
    const skips = /\btest\.skip\s*\(/.test(catchBody);

    if (!rethrows && !asserts && !optedOut && !skips) {
      offenders.push({
        file: relPath,
        line: src.slice(0, m.index!).split("\n").length,
      });
    }
  }
  return offenders;
}

describe("E2E specs never swallow their own assertions", () => {
  it("has no try/catch that discards a failing expect()", () => {
    const files = specFiles(E2E_DIR);
    expect(files.length).toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = file.slice(file.indexOf("/e2e/") + 1);
      for (const o of findSwallowedAssertions(src, rel)) {
        offenders.push(`${o.file}:${o.line}`);
      }
    }

    // The message matters more than the assertion: whoever trips this needs to
    // know that both answers are acceptable and which one they are choosing.
    // Jest's expect takes no message argument (that is Playwright's), so the
    // explanation is thrown and the assertion below states the invariant.
    if (offenders.length > 0) {
      throw new Error(
        `These try/catch blocks contain expect() and discard the failure, so the ` +
          `test can pass without exercising anything:\n  ${offenders.join("\n  ")}\n\n` +
          `Either let it throw (the assertion is the point of the test), or mark ` +
          `the catch with "// swallow-ok: <reason>" if swallowing is correct — ` +
          `cleanup nets legitimately are.\n` +
          `Invariant: ConsoleOracleIsNeverTheOnlyAssertion, ` +
          `specs/e2e-test-infrastructure.allium`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("detects the shape it is looking for", () => {
    // Arming the check: a detector never seen to fire is not known to work.
    const bad = `
      test("x", async () => {
        try {
          expect(await thing()).toBe(true);
        } catch {
          console.log("Note: skipping");
        }
      });`;
    expect(findSwallowedAssertions(bad, "probe.ts")).toHaveLength(1);

    const optedOut = bad.replace(
      'console.log("Note: skipping");',
      "// swallow-ok: probe",
    );
    expect(findSwallowedAssertions(optedOut, "probe.ts")).toHaveLength(0);

    const rethrown = bad.replace('console.log("Note: skipping");', "throw e;");
    expect(findSwallowedAssertions(rethrown, "probe.ts")).toHaveLength(0);

    const noAssertion = `try { await thing(); } catch { /* best effort */ }`;
    expect(findSwallowedAssertions(noAssertion, "probe.ts")).toHaveLength(0);

    const skipped = bad.replace(
      'console.log("Note: skipping");',
      'test.skip(true, "external service unavailable");',
    );
    expect(findSwallowedAssertions(skipped, "probe.ts")).toHaveLength(0);
  });
});
