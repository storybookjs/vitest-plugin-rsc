import { afterEach, beforeAll, beforeEach } from "vitest";
import { server } from "vitest/browser";
import { cleanup } from "./index.ts";
import { forgetClientFiles } from "./client-graph.ts";
import { registry } from "./registry.ts";

// Registered by `vitestPluginNext()` as a setup file. With affected/browser.ts
// the only module of the layers that imports Vitest, which another host, or a
// static build, runs without. Importing the entry first matters: it installs
// the server's platform before a test file can import a module of Next's
// server.

// Vitest evaluates a setup file again before every test file, also one whose
// tests are all skipped. So the files with `"use client"` are evaluated again
// for the next file, as Vitest evaluates them, and the CSS that a test file
// with the directive linked goes once the next file starts.
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
beforeAll(({}, suite) => {
  const { filepath } = suite.file;
  registry.nodeFiles = () => [...server.config.setupFiles, filepath];
});

afterEach(cleanup);
// Also before a test: Vitest skips the remaining `afterEach` hooks when one
// of them throws, as a test's own does when it asserts in it.
beforeEach(cleanup);
