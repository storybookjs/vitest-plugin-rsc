import { afterEach, beforeAll, beforeEach } from "vitest";
import { server } from "vitest/browser";
import { cleanup } from "./index.ts";
import { forgetClientFiles, linkClientStylesheets } from "./client-graph.ts";
import { registry } from "./registry.ts";
import { ssrLayer } from "./server-layers.ts";

// Registered by `vitestPluginNext()` as a setup file. With affected/browser.ts
// the only module of the layers that imports Vitest, which another host, or a
// static build, runs without. Importing the entry first matters: it installs
// the server's platform before a test file can import a module of Next's
// server.

// Vitest evaluates a setup file again before every test file, also one whose
// tests are all skipped. So the files with `"use client"` are evaluated again
// for the next file, as Vitest evaluates them, and the CSS of a test file with
// the directive goes once the next file starts.
forgetClientFiles();

// The node of a test has the stylesheets of the files that render it: the
// setup files, in the order of the config, and the test file, which Vitest
// gives a `beforeAll` of a setup file as its second argument. The first is
// the fixtures, which Vitest reads off the parameter: it has to be a pattern.
// Until then, as a setup file or a test file collects, the setup files
// alone: not the test file of before, with `isolate: false`. See `nodeFiles`
// in registry.ts.
registry.nodeFiles = () => [...server.config.setupFiles];
// oxlint-disable-next-line no-empty-pattern
beforeAll(async ({}, suite) => {
  const { filepath } = suite.file;
  registry.nodeFiles = () => [...server.config.setupFiles, filepath];
  // The stylesheets of the setup files and the test file with `"use client"`,
  // which every test of the file uses, its `beforeAll` hooks too.
  await linkClientStylesheets();
});

// The ssr layer, which the entry does not wait for: with a dev server, the
// first time it loads compiles Next's server, which takes longer than a test
// may. In a setup file it does not count towards a test's timeout. A layer
// that fails to load fails the test file here.
await ssrLayer;

// Without arguments: a hook gets the test's context, which is no options.
afterEach(() => cleanup());
// Also before a test: Vitest skips the remaining `afterEach` hooks when one
// of them throws, as a test's own does when it asserts in it. Every test uses
// the setup files and the test file, so the stylesheets of those with
// `"use client"` come back, which `cleanup()` unlinked.
beforeEach(async () => {
  await cleanup();
  await linkClientStylesheets();
});
