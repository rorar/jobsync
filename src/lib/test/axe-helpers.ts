import { configureAxe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

export const axe = configureAxe({
  rules: {
    // color-contrast is unreliable in jsdom (no computed styles)
    "color-contrast": { enabled: false },
    // Region rule flags fragments not wrapped in landmarks — our components
    // are rendered in isolation, not full pages
    region: { enabled: false },
  },
});
