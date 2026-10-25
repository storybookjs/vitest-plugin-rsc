import { inject } from "vitest";
import { setUpTestFiles } from "./setup.ts";

// The setup file of a run in a worker of Node.js, with a DOM of happy-dom or
// jsdom, which `vitestPluginNext()` registers without Browser Mode. See
// setup.ts. The setup files of the run are what `vitestPluginNext()`
// provides (provided-context.d.ts), where Browser Mode has them as
// `server.config` of `vitest/browser`.

await setUpTestFiles(inject("vitest-plugin-rsc:setup-files"));
