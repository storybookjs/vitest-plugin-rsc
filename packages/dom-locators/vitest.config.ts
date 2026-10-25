import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

// The package's suite in Chromium, against `vitest/browser`'s page and
// Playwright's own actions, and the part of it that needs no browser in the
// two DOMs of Node.js, against ivya, the engine of Vitest's locators, in the
// same DOM, with the package's `expect.element()` for Vitest's.
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
        include: [
          "test/node/**/*.test.{ts,tsx}",
          "test/wait.test.ts",
          "test/expect-element.test.ts",
        ],
        environment,
        setupFiles: ["./test/node/setup.ts"],
        // test/node/oracle.test.ts holds every locator of its tables to
        // ivya's: in jsdom 2 to 6 s a test on a CI runner, where Vitest
        // gives a test 5 s in Node.js.
        testTimeout: 20_000,
      },
    }),
  ),
];
