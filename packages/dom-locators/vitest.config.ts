import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  test: {
    name: "dom-locators",
    include: ["test/**/*.test.{ts,tsx}"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      screenshotFailures: false,
      instances: [{ browser: "chromium" }],
    },
  },
});
