import "@testing-library/jest-dom";
import { ACT_ENVIRONMENT_NOISE } from "./jest.act-noise";

// Drop ONE React message, for the reasons set out in jest.act-noise.ts: it is a
// disagreement between React 19 and Testing Library about a global flag, it
// cannot be fixed from here, and it accounts for 829 of 895 console.error lines
// in a five-suite run — which is how a real warning gets scrolled past.
//
// Everything else is forwarded untouched. A test that installs its own
// console.error spy replaces this wrapper for its duration and restores it
// afterwards, so the 14 suites that do that are unaffected.
const forwardConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith(ACT_ENVIRONMENT_NOISE)) {
    return;
  }
  forwardConsoleError(...args);
};

// Mock fetch if not defined
if (typeof global.fetch === "undefined") {
  global.fetch = jest.fn();
}

// Mock ResizeObserver for Radix UI components
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
