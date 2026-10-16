import type { ModuleRunner } from "vite/module-runner";
import { commands } from "vitest/browser";
import { isHostModule } from "../host-module.ts";
import { checkFetchedModules, createEnvironmentRunner, takeFetchedModules } from "../utils.ts";
import { registry } from "./registry.ts";
import { clientEntryCommand, type ClientEntry } from "./styles-command.ts";

// A file with `"use client"` is a client boundary: code of the browser layer,
// see client-files.ts. A test file with the directive renders a Client
// Component as React does, with a library like vitest-browser-react. There is
// no page of the app, no request and no router of Next.
//
// So such files are evaluated in one module graph of the browser layer, which
// lives as long as the tab, as the modules of a test do without Next. What a
// file imports loads there once, with Next's React for the browser, and so
// does the library that renders. Every page of the app has a graph of its
// own (`openPage()` in index.ts), which this one shares no module with.

const environment = "react_client";

let graph: ModuleRunner | undefined;
// One file at a time: a file that loads may have the graph evaluate its
// modules again.
let loading: Promise<unknown> = Promise.resolve();
// Whether the graph is evaluating the modules of a file now.
let evaluating = false;
// The modules that a setup file without `"use client"` had the graph load,
// in order: loaded once, and again after a change of a file, as a page load
// loads them again.
const loadedOnce = new Map<string, string>();
// The stylesheets that the client files linked: see `unlinkClientStylesheets()`.
const linked = new Set<HTMLLinkElement>();

// What stays the same when a file of the app changes: a package, and a module
// of the page (../host-module.ts). React stays, with the roots it made.
const isDependency = ({ id, file }: { id: string; file: string | null }) =>
  isHostModule(id) || (file ?? id).includes("/node_modules/");

// What Next's Flight client of the browser layer reads as `__webpack_require__`
// when it loads, and wraps a property of. A Server Action that a client file
// imports brings that client. A page sets one of its own when it loads
// (`openPage()` in index.ts): one that the graph and a page shared would keep
// the page.
const browserRequire = (id: string) => registry.loadBrowserModule(id);

/**
 * Evaluates in the module graph of the browser layer what `file`, a file of
 * the host, loads there: see `ClientEntry`. The module of the rsc layer for
 * such a file calls this before its own code runs, as Vitest evaluates what a
 * file imports before it. So a test file with `"use client"` registers its
 * tests with Vitest, which imports the file in the rsc layer.
 *
 * Vitest evaluates a setup file again for every test file, and a test file
 * every time it runs it, so a file with `"use client"` is evaluated again as
 * well. What it imports, and what a setup file without the directive
 * imports, once for the graph, as the browser does for what Vitest evaluates
 * in the tab.
 */
export function loadClientEntry(file: string): Promise<void> {
  // A module that the graph evaluates may import a file of the host without
  // the directive, like a setup file, which is the page's own module, see
  // ../host-module.ts: the page imports the module of the rsc layer for it,
  // which calls this. What that file loads here was loaded when Vitest ran
  // the file, and waiting for the file that is loading would wait forever.
  if (evaluating) return Promise.resolve();
  const loaded = loading.then(() => load(file));
  loading = loaded.catch(() => {});
  return loaded;
}

const clientEntryOf = (file: string) =>
  (commands as unknown as Record<string, (file: string) => Promise<ClientEntry>>)[
    clientEntryCommand
  ]!(file);

async function load(file: string): Promise<void> {
  const { modules, stylesheets } = await clientEntryOf(file);
  if (modules.length === 0) return;
  // The server's modules as they are now: the graph outlives a page load.
  await checkFetchedModules();
  // A test that fails says where, in the file as it is written.
  graph ??= createEnvironmentRunner(environment, { sourcemaps: true });
  const { evaluatedModules } = graph;
  // After a change of a file the graph evaluates the modules of the app
  // again, as a page load does: the server cannot tell which of them
  // changed, as another runner may have fetched them again already.
  const changed = await takeFetchedModules(graph);
  if (changed) {
    for (const node of evaluatedModules.idToModuleMap.values()) {
      if (!isDependency(node)) evaluatedModules.invalidateModule(node);
    }
  }
  registry.browserRequire = browserRequire;
  serverActionsNeedTheApp();
  // The file itself runs every time it loads, as Vitest runs it: its tests,
  // or the hooks of a setup file, are collected as it does.
  for (const node of evaluatedModules.getModulesByFile(file) ?? []) {
    evaluatedModules.invalidateModule(node);
  }
  evaluating = true;
  try {
    // What the setup files had loaded, as it was: before the file.
    if (changed) for (const url of loadedOnce.keys()) await graph.import(url);
    for (const { url, file: moduleFile } of modules) {
      if (moduleFile !== file) loadedOnce.set(url, moduleFile);
      await graph.import(url);
    }
  } finally {
    evaluating = false;
  }
  await linkStylesheets(stylesheets);
}

// The CSS of what a test file with `"use client"` imports, linked in the
// document, as a page of the app links its CSS: see styles.ts. Vite's
// `<style>` of a module would stay for the pages of the files after it.
async function linkStylesheets(urls: string[]): Promise<void> {
  const links = urls.map((href) =>
    Object.assign(document.createElement("link"), { rel: "stylesheet", href }),
  );
  // A stylesheet that fails to load holds up nothing.
  const loaded = links.map(
    (link) => new Promise((resolve) => (link.onload = link.onerror = resolve)),
  );
  for (const link of links) linked.add(link);
  document.head.append(...links);
  await Promise.all(loaded);
}

/**
 * Takes back the stylesheets that client files linked: the plugin's setup
 * file calls this before every test file. The graph keeps its modules.
 */
export function unlinkClientStylesheets(): void {
  for (const link of linked) link.remove();
  linked.clear();
}

// A Server Action that a component of the browser layer calls goes through
// `callServer()` of Vite RSC, which calls this global. A page sets Next's own,
// which posts to that page (client.tsx). A client file has no page, and the
// router of a page that was left would never answer.
function serverActionsNeedTheApp(): void {
  globalThis.__viteRscCallServer = async (id: string) => {
    const name = id.split("#").at(-1);
    throw new Error(
      `vitest-plugin-rsc: a component called the Server Action ${name} in a test file with ` +
        `"use client". A Server Action needs Next's app, which such a file does not render ` +
        `in: test it with renderServer() in a test file without "use client".`,
    );
  };
}
