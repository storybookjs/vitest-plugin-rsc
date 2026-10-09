import { afterAll, afterEach, beforeEach } from "vitest";
import { cleanup } from "./index.ts";
import { unloadClientFile } from "./client-graph.ts";
import { clientFileId } from "./client-ids.ts";
import { registry } from "./registry.ts";

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

// The files that render the node of a test: its test file, with the setup
// files before it. The node has the stylesheets of what they import: see
// styles.ts. Vitest's state of the test that runs, on the page: Vitest's own
// commands read the test file there too.
type WorkerState = {
  filepath?: string;
  current?: { file?: { filepath: string } };
  config: { setupFiles: string[] };
};
registry.nodeFiles = () => {
  const state = (globalThis as { __vitest_worker__?: WorkerState }).__vitest_worker__;
  if (!state) return undefined;
  const testFile = state.filepath || state.current?.file?.filepath;
  return [...state.config.setupFiles, ...(testFile ? [testFile] : [])];
};
