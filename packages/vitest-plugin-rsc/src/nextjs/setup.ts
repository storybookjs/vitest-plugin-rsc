import { afterEach, beforeEach } from "vitest";
import { cleanup } from "./index.ts";
import { unlinkClientStylesheets } from "./client-graph.ts";
import { registry } from "./registry.ts";

// Registered by `vitestPluginNext()` as a setup file. With affected/browser.ts
// the only module of the layers that imports Vitest, which another host, or a
// static build, runs without. Importing the entry first matters: it installs
// the server's platform before a test file can import a module of Next's
// server.

// Vitest evaluates a setup file again before every test file, also one whose
// tests are all skipped. So the CSS that a test file with `"use client"`
// linked goes once the next file starts, and so do the files of the host
// that the page had loaded for the test file before: `vitestPluginNext()`
// puts this file first in `setupFiles`, so the setup files of the project
// and the test file are the ones that come after it. See `hostFiles` in
// registry.ts.
unlinkClientStylesheets();
registry.hostFiles.length = 0;

afterEach(cleanup);
// Also before a test: Vitest skips the remaining `afterEach` hooks when one
// of them throws, as a test's own does when it asserts in it.
beforeEach(cleanup);
