import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

// The package's suite in Chromium, against `vitest/browser`'s page and
// Playwright's own actions, and the part of it that needs no browser in the
// two DOMs of Node.js, against ivya, the engine of Vitest's locators, in the
// same DOM.
export const domLocatorsProjects = [
  defineProject({
    root,
    test: {
      name: "dom-locators",
      include: ["test/**/*.test.{ts,tsx}"],
      exclude: ["test/node/**"],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        screenshotFailures: false,
        instances: [{ browser: "chromium" }],
      },
    },
  }),
  ...(["happy-dom", "jsdom"] as const).map((environment) =>
    defineProject({
      root,
      test: {
        name: `dom-locators (${environment})`,
        include: ["test/node/**/*.test.{ts,tsx}", "test/wait.test.ts"],
        environment,
      },
    }),
  ),
];
