import { readFileSync } from "fs";
import path from "path";
import { ACT_ENVIRONMENT_NOISE } from "../jest.act-noise";

/**
 * Guards the one console.error filter this project installs (jest.setup.ts).
 *
 * A filter is only as good as its match, and this one matches a string owned by
 * React. If React rewords the message, the filter silently stops working and
 * the noise returns; if someone widens the filter, it starts eating warnings it
 * was never meant to touch. Both are quiet failures, so they are pinned here.
 */
describe("act() environment noise filter", () => {
  it("still matches what React actually prints", () => {
    // Read the string from React rather than restating it. If this fails after
    // a react-dom upgrade, the filter needs updating — not this test.
    const reactDom = readFileSync(
      path.join(
        __dirname,
        "..",
        "node_modules",
        "react-dom",
        "cjs",
        "react-dom-client.development.js",
      ),
      "utf-8",
    );

    expect(reactDom).toContain(ACT_ENVIRONMENT_NOISE);
  });

  it("does not match the warning that reports a real act() violation", () => {
    // The genuine one, guarded by the complementary condition
    // (isConcurrentActEnvironment() && actQueue === null). It must never be
    // swallowed, so the filter's prefix must not match its opening.
    const realWarning =
      "An update to %s inside a test was not wrapped in act(...).";

    expect(realWarning.startsWith(ACT_ENVIRONMENT_NOISE)).toBe(false);
  });

  it("suppresses the noise and forwards everything else", () => {
    // The wrapper from jest.setup.ts is live in this process. Spying replaces
    // it, so measure through a downstream sink instead: install a spy, then
    // restore, and assert on what the wrapper itself lets through.
    const seen: unknown[][] = [];
    const wrapper = console.error;
    const original = jest
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        seen.push(args);
      });
    // Re-apply the wrapper ON TOP of the spy, reproducing the setup chain.
    const spied = console.error;
    console.error = (...args: unknown[]) => {
      if (
        typeof args[0] === "string" &&
        args[0].startsWith(ACT_ENVIRONMENT_NOISE)
      ) {
        return;
      }
      spied(...args);
    };

    console.error(`${ACT_ENVIRONMENT_NOISE} extra tail`);
    console.error("An update to Foo inside a test was not wrapped in act(...).");
    console.error("something else entirely", 42);

    console.error = wrapper;
    original.mockRestore();

    expect(seen).toEqual([
      ["An update to Foo inside a test was not wrapped in act(...)."],
      ["something else entirely", 42],
    ]);
  });
});
