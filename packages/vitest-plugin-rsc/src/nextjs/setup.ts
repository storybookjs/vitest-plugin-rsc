import { afterAll, afterEach, beforeEach } from "vitest";
import { cleanup } from "./index.ts";
import { unloadClientFile } from "./client-graph.ts";
import { clientFileId } from "./client-ids.ts";

// Registered by `vitestPluginNext()` as a setup file. Importing the entry
// first matters: it installs the server's platform before a test file can
// import a module of Next's server.
afterEach(cleanup);
// Also before a test: Vitest skips the remaining `afterEach` hooks when one
// of them throws, as a test's own does when it asserts in it.
beforeEach(cleanup);
// A test file with `"use client"` is done with what it imports: the pages of
// the files after it do not load that. Vitest reads the first parameter for
// the fixtures it names, so it has to be a pattern.
// oxlint-disable-next-line no-empty-pattern
afterAll(({}, { file }) => unloadClientFile(clientFileId(file.filepath)));
