import { afterEach, beforeEach } from "vitest";
import { cleanup } from "./index.ts";
import { unlinkClientStylesheets } from "./client-graph.ts";

// Registered by `vitestPluginNext()` as a setup file. Importing the entry
// first matters: it installs the server's platform before a test file can
// import a module of Next's server.

// Vitest evaluates a setup file again before every test file, also one whose
// tests are all skipped. So the CSS that a test file with `"use client"`
// linked goes once the next file starts.
unlinkClientStylesheets();

afterEach(cleanup);
// Also before a test: Vitest skips the remaining `afterEach` hooks when one
// of them throws, as a test's own does when it asserts in it.
beforeEach(cleanup);
