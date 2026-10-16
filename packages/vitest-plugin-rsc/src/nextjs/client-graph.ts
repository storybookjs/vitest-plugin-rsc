import type { ModuleRunner } from "vite/module-runner";
import { isHostModule } from "../host-module.ts";
import {
  checkFetchedModules,
  createEnvironmentRunner,
  fetchJson,
  takeFetchedModules,
} from "../utils.ts";
import { registry } from "./registry.ts";
import { stylesheetsPath } from "./styles-command.ts";

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

// The URLs of the stylesheets of a client file, from the dev server: see styles.ts.
const stylesheetsOf = (url: string) => fetchJson<string[]>(stylesheetsPath, { url });

/**
 * Evaluates a file of the host with `"use client"`, at its URL in the browser
 * layer, in the module graph of that layer. The module of the rsc layer for
 * the file calls this before its own code runs, as Vitest evaluates what a
 * file imports before it. So a test file with the directive registers its
 * tests with Vitest, which imports the file in the rsc layer, and a setup
 * file with it its hooks.
 *
 * Every time Vitest imports the file, as Vitest evaluates the file itself
 * every time: a setup file before every test file. What the file imports,
 * once for the graph, as the browser does for what Vitest evaluates in the
 * tab.
 */
export async function loadClientFile(url: string): Promise<void> {
  // The server's modules as they are now: the graph outlives a page load.
  await checkFetchedModules();
  // A test that fails says where, in the file as it is written.
  graph ??= createEnvironmentRunner(environment, { sourcemaps: true });
  const { evaluatedModules } = graph;
  // After a change of a file the graph evaluates the modules of the app
  // again, as a page load does: the server cannot tell which of them
  // changed, as another runner may have fetched them again already. What a
  // setup file with the directive had set up comes back with the setup file,
  // which Vitest runs before every test file.
  if (await takeFetchedModules(graph)) {
    for (const node of evaluatedModules.idToModuleMap.values()) {
      if (!isDependency(node)) evaluatedModules.invalidateModule(node);
    }
  }
  registry.browserRequire = browserRequire;
  serverActionsNeedTheApp();
  // The file itself runs every time it loads, as Vitest runs it: its tests,
  // or the hooks of a setup file, are collected as it does.
  const own = evaluatedModules.getModuleByUrl(url);
  if (own) evaluatedModules.invalidateModule(own);
  await graph.import(url);
  await linkStylesheets(await stylesheetsOf(url));
}

// The CSS of what a file with `"use client"` imports, linked in the document,
// as a page of the app links its CSS: see styles.ts. Vite's `<style>` of a
// module would stay for the pages of the files after it.
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
