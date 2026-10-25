import { fileURLToPath } from "node:url";
import { ForksPoolWorker, type PoolRunnerInitializer } from "vitest/node";

// The pool of a project whose page is in a worker of Node.js (index.ts):
// Vitest's own forks worker, `ForksPoolWorker` (`@experimental`), which forks
// `<distPath>/workers/forks.js`, with the plugin's entry there in place of
// Vitest's: see workers/forks.ts. Always the built entry, which Node.js and
// Bun run as it is, also for the source of the plugin, as for the modules of
// Node.js in src/node/. Only Vitest loads this file, by its path: see
// `withNodeHostPool()` in index.ts.

const distPath = fileURLToPath(
  new URL(import.meta.url.endsWith(".ts") ? "../dist/" : "./", import.meta.url),
);

export const nodeHostPool: PoolRunnerInitializer = {
  // Not "forks": Vitest takes its own entry for a pool of that name.
  name: "vitest-plugin-rsc",
  createPoolWorker: (options) => new ForksPoolWorker({ ...options, distPath }),
};
