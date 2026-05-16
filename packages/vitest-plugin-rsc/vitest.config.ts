import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  test: {
    name: "vitest-plugin-rsc",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
