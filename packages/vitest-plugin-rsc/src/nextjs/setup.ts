import pageHost from "virtual:vitest-plugin-rsc/page-host";
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import { cleanup, newBrowserContext } from "./index.ts";
import { forgetClientFiles, linkStylesheetsOf, loadedAsClientFile } from "./client-graph.ts";
import { askDevServer, forgetHeardVersions } from "../utils.ts";
import { pollOnEveryChange } from "./speed-features.ts";
import { keepHostDocument } from "./host-document.ts";
import { leaveKeptAppWithPage, noRouter } from "./page.ts";
import { registry } from "./registry.ts";
import {
  modulesAheadEvent,
  routesAheadEvent,
  type ModulesAheadQuestion,
  type RoutesAheadNews,
} from "./routes-ahead-shared.ts";
import { ssrLayer } from "./server-layers.ts";
// With the speed feature `fastCrypto`, PBKDF2 of the page's `crypto.subtle` is
// a stand-in that costs microseconds, for the app and the tests alike: see
// fast-crypto.ts. Here, as the setup file is in a test run of Vitest only.
import "virtual:vitest-plugin-rsc/next-fast-crypto";

// What the setup file of a run of Vitest does, which `vitestPluginNext()`
// registers: setup-browser.ts with Browser Mode, setup-node.ts in a worker of
// Node.js. With those, the only modules of the layers that import Vitest,
// which another host, or a static build, runs without. Importing the entry
// first matters: it installs the server's platform before a test file can
// import a module of Next's server.

/**
 * The hooks of every test file, whose setup files are `setupFiles`, as the
 * config of the run has them. Resolves once the ssr layer has loaded.
 */
export async function setUpTestFiles(setupFiles: readonly string[]): Promise<void> {
  // Vitest evaluates a setup file again before every test file, also one whose
  // tests are all skipped. So the files with `"use client"` are evaluated again
  // for the next file, as Vitest evaluates them, and the CSS of a test file
  // goes once the next file starts. And the page asks the dev server for the
  // versions of its modules once more, also when an `afterAll` of the file
  // before failed before the one below: Vitest runs a file again after a
  // change on a connection of its own, which the answer orders before the
  // file's first page. See `heardVersions` in utils.ts.
  forgetClientFiles();
  forgetHeardVersions();

  // The node of a test has the stylesheets of the files that render it: the
  // setup files, in the order of the config, and the test file, which Vitest
  // gives a `beforeAll` of a setup file as its second argument. The first is
  // the fixtures, which Vitest reads off the parameter: it has to be a pattern.
  // Until then, as a setup file or a test file collects, the setup files
  // alone: not the test file of before, with `isolate: false`. See `nodeFiles`
  // in registry.ts.
  let nodeFiles = [...setupFiles];
  registry.nodeFiles = () => nodeFiles;
  // A test file with `"use client"` renders a component as React does, as
  // with Testing Library: its tests have the browser's own `fetch`, cookies
  // and storage, and the tester stays when a link or a form would leave it.
  // Every test of any other file is in a browser context of the app of its
  // own, which a `beforeEach` of the test file seeds before it renders.
  let clientFile = false;
  let keptDocument: (() => void) | undefined;
  let modulesLoaded: (() => void) | undefined;
  // oxlint-disable-next-line no-empty-pattern
  beforeAll(async ({}, suite) => {
    modulesLoaded = preloadModulesAhead(suite.file.filepath);
    nodeFiles = [...setupFiles, suite.file.filepath];
    clientFile = loadedAsClientFile(suite.file.filepath);
    if (clientFile) keptDocument = keepHostDocument((url) => reportError(noRouter(url)));
    // Their stylesheets, which every test of the file uses, its `beforeAll`
    // hooks too.
    await linkStylesheetsOf(nodeFiles);
    compileRoutesAhead(suite.file.filepath);
  });
  // The kept app of `keepApp` (page.ts) is one test file's: the next file
  // starts with its modules evaluated again, as it does its setup files. Also
  // after a page that could not be left, which fails this file.
  afterAll(async () => {
    try {
      await leaveKeptAppWithPage("the end of the test file");
    } finally {
      keptDocument?.();
      modulesLoaded?.();
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

  // The speed feature `watchDom` polls again on the next change of the
  // document, in any DOM: see speed-features.ts.
  pollOnEveryChange(expect, () => vi.isFakeTimers());
}

// The routes the test file opened in the run before: the dev server compiles
// them while the hooks before its first page load run, like the app's
// `beforeEach` that sets up its database, and keeps the routes it opens now.
// Not as the setup files load, which the dev server serves meanwhile. See
// routes-ahead.ts. Without an answer to wait for.
function compileRoutesAhead(testFile: string) {
  const tell = (news: RoutesAheadNews) => {
    askDevServer(routesAheadEvent, news).catch(() => {});
  };
  tell({ testFile });
  const opened = new Set<string>();
  registry.routeOpened = (entry) => {
    if (opened.has(entry)) return;
    opened.add(entry);
    tell({ testFile, opened: entry });
  };
}

// Whether the tab has had its first test file: on the global of its realm,
// which the modules a test file loads natively stay in.
const modulesAheadOf = Symbol.for("vitest-plugin-rsc modules ahead");

// The modules that the server layers of the page import natively in the first
// test file of a tab, as the run before had them: preloaded at once as its
// hooks start, with `modulepreload`, which fetches and compiles a module but
// does not evaluate it, so the page imports each one as before, in its own
// order. Not before: a module is what the page gets for its URL once the
// mocks of the setup files and of the test file are in place, which they are
// once Vitest has collected the file. And only what the file loads from then
// on: not the test file and its imports, which are the page's own. Returns
// what tells the dev server, once the file is done, which modules it loaded;
// nothing for a later file of the tab, which has them. A DOM of Node.js loads
// no link, and imports none of them over HTTP. See routes-ahead.ts. Without
// an answer to wait for.
function preloadModulesAhead(testFile: string): (() => void) | undefined {
  const realm = globalThis as { [modulesAheadOf]?: true };
  if (!pageHost.loadsStylesheets || realm[modulesAheadOf]) return;
  realm[modulesAheadOf] = true;
  const preloaded = new Set<string>();
  // By path, as the port of the dev server is the run's.
  const loaded = new Set<string>();
  const record = (entries: PerformanceEntryList) => {
    for (const entry of entries as PerformanceResourceTiming[]) {
      const url = new URL(entry.name);
      if (url.origin !== location.origin || entry.responseStatus >= 400) continue;
      // A module that a module imports, or one preloaded: not a stylesheet,
      // or what the page fetches.
      if (entry.initiatorType === "script" || preloaded.has(entry.name)) {
        loaded.add(url.pathname + url.search);
      }
    }
  };
  const observer = new PerformanceObserver((list) => record(list.getEntries()));
  observer.observe({ type: "resource" });
  askDevServer<string[]>(modulesAheadEvent, {} satisfies ModulesAheadQuestion).then(
    (modules) => {
      for (const path of modules) {
        const link = document.createElement("link");
        link.rel = "modulepreload";
        link.href = new URL(path, location.origin).href;
        preloaded.add(link.href);
        // The module map has it from then on: the link has done its part.
        const done = () => link.remove();
        link.addEventListener("load", done, { once: true });
        link.addEventListener("error", done, { once: true });
        document.head.append(link);
      }
    },
    () => {},
  );
  return () => {
    record(observer.takeRecords());
    observer.disconnect();
    const news: ModulesAheadQuestion = { loaded: { testFile, modules: [...loaded] } };
    askDevServer(modulesAheadEvent, news).catch(() => {});
  };
}
