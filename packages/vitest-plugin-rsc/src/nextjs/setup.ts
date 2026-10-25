import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import { page, server } from "vitest/browser";
import { cleanup, newBrowserContext } from "./index.ts";
import { forgetClientFiles, linkStylesheetsOf, loadedAsClientFile } from "./client-graph.ts";
import { findOnEveryChange, forgetTestFileAnswers, pollOnEveryChange } from "./speed-features.ts";
import { keepHostDocument, noRouter } from "./host-document.ts";
import { leaveKeptAppWithPage, preloadClient } from "./page.ts";
import { registry } from "./registry.ts";
import { ssrLayer } from "./server-layers.ts";
// With the speed feature `fastCrypto`, PBKDF2 of the page's `crypto.subtle` is
// a stand-in that costs microseconds, for the app and the tests alike: see
// fast-crypto.ts. Here, as the setup file is in a test run of Vitest only.
import "virtual:vitest-plugin-rsc/next-fast-crypto";

// Registered by `vitestPluginNext()` as a setup file. The only module of the
// layers that imports Vitest, which another host, or a static build, runs
// without. Importing the entry first matters: it installs the server's
// platform before a test file can import a module of Next's server.

// Vitest evaluates a setup file again before every test file, also one whose
// tests are all skipped. So the files with `"use client"` are evaluated again
// for the next file, as Vitest evaluates them, and the CSS of a test file
// goes once the next file starts.
forgetClientFiles();

// The node of a test has the stylesheets of the files that render it: the
// setup files, in the order of the config, and the test file, which Vitest
// gives a `beforeAll` of a setup file as its second argument. The first is
// the fixtures, which Vitest reads off the parameter: it has to be a pattern.
// Until then, as a setup file or a test file collects, the setup files
// alone: not the test file of before, with `isolate: false`. See `nodeFiles`
// in registry.ts.
let nodeFiles = [...server.config.setupFiles];
registry.nodeFiles = () => nodeFiles;
// A test file with `"use client"` renders a component as React does, as
// with Testing Library: its tests have the browser's own `fetch`, cookies
// and storage, and the tester stays when a link or a form would leave it.
// Every test of any other file is in a browser context of the app of its
// own, which a `beforeEach` of the test file seeds before it renders.
let clientFile = false;
let keptDocument: (() => void) | undefined;
// oxlint-disable-next-line no-empty-pattern
beforeAll(async ({}, suite) => {
  nodeFiles = [...server.config.setupFiles, suite.file.filepath];
  clientFile = loadedAsClientFile(suite.file.filepath);
  if (clientFile) keptDocument = keepHostDocument((url) => reportError(noRouter(url)));
  // The modules of the app's client, which its pages run, come while the
  // hooks of the file run, like a database that starts. A page load that
  // needs one that failed gets its error.
  else preloadClient().catch(() => {});
  // Their stylesheets, which every test of the file uses, its `beforeAll`
  // hooks too.
  await linkStylesheetsOf(nodeFiles);
});
// The kept app of `keepApp` (page.ts) is one test file's: the next file
// starts with its modules evaluated again, as it does its setup files. Also
// after a page that could not be left, which fails this file.
afterAll(async () => {
  try {
    await leaveKeptAppWithPage("the end of the test file");
  } finally {
    keptDocument?.();
    // The next file asks the dev server again: see speed-features.ts.
    forgetTestFileAnswers();
  }
});

// The ssr layer, which the entry does not wait for: with a dev server, the
// first time it loads compiles Next's server, which takes longer than a test
// may. In a setup file it does not count towards a test's timeout. A layer
// that fails to load fails the test file here.
await ssrLayer();

// Without arguments: a hook gets the test's context, which is no options.
afterEach(() => cleanup());
// Also before a test: Vitest skips the remaining `afterEach` hooks when one
// of them throws, as a test's own does when it asserts in it. Every test uses
// the setup files and the test file, so their stylesheets come back, which
// `cleanup()` unlinked.
beforeEach(async () => {
  await (clientFile ? cleanup() : newBrowserContext());
  await linkStylesheetsOf(nodeFiles);
});

// The speed feature `watchDom` looks for an element, and polls again, on the
// next change of the document: see speed-features.ts.
findOnEveryChange(page.getByText(""));
pollOnEveryChange(expect, () => vi.isFakeTimers());
