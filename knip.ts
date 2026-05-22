import type { KnipConfig } from "knip";

const config: KnipConfig = {
  // Entry points — Next.js App Router + side-effect registrations
  entry: [
    "src/auth.ts",
    "src/auth.config.ts",

    // Side-effect imports: module self-registration (import "./modules/x")
    "src/lib/connector/register-all.ts",
    "src/lib/connector/*/modules/*/index.ts",

    // Event consumers (imported for side-effects in instrumentation.ts)
    "src/lib/events/consumers/index.ts",

    // Migration scripts
    "scripts/migrate-*.ts",
  ],

  // Project scope
  project: [
    "src/**/*.{ts,tsx}",
    "types/**/*.ts",
    "scripts/**/*.ts",
  ],

  // Ignore patterns
  ignore: [
    // Generated code (OpenAPI types — exports are intentional API surface)
    "src/lib/connector/job-discovery/modules/eures/generated.ts",
  ],

  // Dependencies to ignore (used implicitly, not via JS imports)
  ignoreDependencies: [
    // Next.js virtual package — import "server-only" is framework-provided
    "server-only",
    // Transitive/peer deps of @nivo/bar + @nivo/calendar
    "@nivo/core",
    "@react-spring/web",
    // Transitive dep of @dnd-kit/core
    "@dnd-kit/utilities",
    // Static assets in public/flags/ — SVG references, not JS imports
    "circle-flags",
    // Type import in postcss.config.mjs — provided by tailwindcss
    "postcss-load-config",
  ],

  // Exports used only in the same file are OK
  // (common in models, types, and action files)
  ignoreExportsUsedInFile: true,

  // Plugin overrides
  jest: {
    config: ["jest.config.ts"],
    entry: [
      "jest.setup.ts",
      "jest.polyfills.ts",
      "__tests__/**/*.spec.{ts,tsx}",
    ],
  },

  playwright: {
    config: ["playwright.config.ts"],
    entry: [
      "e2e/**/*.spec.ts",
      "e2e/helpers/index.ts",
      "e2e/global-setup.ts",
    ],
  },
};

export default config;
