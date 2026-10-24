import { setUpTestFiles } from "./setup.ts";

// The setup file of a run in a worker of Node.js, with a DOM of happy-dom or
// jsdom, which `vitestPluginNext()` registers without Browser Mode. See
// setup.ts.

// The config of the run, as Vitest gives it to its worker: Browser Mode has
// it as `server.config` of `vitest/browser`.
type Worker = { __vitest_worker__?: { config?: { setupFiles?: string[] } } };

await setUpTestFiles((globalThis as Worker).__vitest_worker__?.config?.setupFiles ?? []);
