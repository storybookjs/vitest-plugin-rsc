import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

// The plugin's virtual modules, which a test mocks with `vi.mock()`: an id
// that resolves, also for a file of `@vitest-environment jsdom`, which Vite
// transforms as the browser's and fails on an import it cannot resolve.
const virtualModules = "virtual:vitest-plugin-rsc/";

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [
    {
      name: "vitest-plugin-rsc:virtual-modules-of-tests",
      resolveId: (id) => (id.startsWith(virtualModules) ? `\0${id}` : undefined),
      load: (id) =>
        id.startsWith(`\0${virtualModules}`) ? "export default undefined;" : undefined,
    },
  ],
  test: {
    name: "vitest-plugin-rsc",
    include: ["src/**/*.test.ts"],
    environment: "node",
    // `gc()`, for the tests of what is collected.
    execArgv: ["--expose-gc"],
  },
});
