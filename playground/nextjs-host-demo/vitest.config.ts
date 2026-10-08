import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

// The checks of check.ts as tests. Each one runs the script in a process of
// its own, which starts a dev server or builds, and opens a browser.
export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  test: {
    name: "nextjs-host-demo",
    include: ["*.test.ts"],
    environment: "node",
    testTimeout: 180_000,
  },
});
