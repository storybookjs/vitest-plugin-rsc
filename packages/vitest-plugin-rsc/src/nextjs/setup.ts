import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { cleanup } from "./index.ts";
import { unloadClientFile, unloadClientFilesExcept, unmountClientRoots } from "./client-graph.ts";
import { clientFileId } from "./client-ids.ts";

// Registered by `vitestPluginNext()` as a setup file. Importing the entry
// first matters: it installs the server's platform before a test file can
// import a module of Next's server.

// Also what a test file with `"use client"` rendered.
async function cleanupAll(): Promise<void> {
  unmountClientRoots();
  await cleanup();
}

afterEach(cleanupAll);
// Also before a test: Vitest skips the remaining `afterEach` hooks when one
// of them throws, as a test's own does when it asserts in it.
beforeEach(cleanupAll);
// A test file with `"use client"` is done: the CSS it linked goes, see
// client-graph.ts. Vitest reads the first parameter for the fixtures it
// names, so it has to be a pattern.
// oxlint-disable-next-line no-empty-pattern
afterAll(({}, { file }) => unloadClientFile(clientFileId(file.filepath)));
// So is a file before it whose tests were all skipped, which ran no hook.
// oxlint-disable-next-line no-empty-pattern
beforeAll(({}, { file }) => unloadClientFilesExcept(clientFileId(file.filepath)));
