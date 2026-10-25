import { page, server } from "vitest/browser";
import { setUpTestFiles } from "./setup.ts";
import { findOnEveryChange } from "./speed-features.ts";

// The setup file of a run in Vitest's Browser Mode, which `vitestPluginNext()`
// registers: the one module of the layers there that imports
// `vitest/browser`. See setup.ts.

await setUpTestFiles(server.config.setupFiles);

// The speed feature `watchDom` looks for an element of `vitest/browser`'s
// locators on every change of the DOM: see speed-features.ts.
findOnEveryChange(page.getByText(""));
