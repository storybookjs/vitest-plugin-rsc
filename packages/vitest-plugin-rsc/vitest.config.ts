import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

// oxlint-disable-next-line no-process-env
const maxWorkers = process.env.CI ? undefined : 4;

export default defineProject({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    name: "vitest-plugin-rsc",
    include: ["src/**/*.test.ts"],
    environment: "node",
    maxWorkers,
  },
});
