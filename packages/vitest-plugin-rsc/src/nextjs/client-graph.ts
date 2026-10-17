import type { ModuleRunner } from "vite/module-runner";
import builtLayers from "virtual:vitest-plugin-rsc/layers";
import { isHostModule } from "../host-module.ts";
import {
  askDevServer,
  checkFetchedModules,
  createEnvironmentRunner,
  takeFetchedModules,
} from "../utils.ts";
import { clientReferenceKeyOf } from "./client-reference.ts";
import { registry } from "./registry.ts";
import {
  graphStylesheetAttribute,
  stylesheetsEvent,
  type StylesheetsQuestion,
} from "./styles-shared.ts";

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
//
// The host imports such a file in the rsc layer, where it is a client
// reference module. That module evaluates the file here as it loads, see
// `loadClientFile()`. A host that uses the exports of the file, like a
// framework that renders a component of it, gets that evaluation with
// `loadClientModule()`.

const environment = "react_client";

let graph: ModuleRunner | undefined;

// The stylesheets that the files of the host linked, one for each URL: the
// tab's, which a page that comes and goes leaves where they are, see
// document.ts. `unlinkClientStylesheets()` takes them back.
const linked = new Map<string, { link: HTMLLinkElement; loaded: Promise<unknown> }>();

// The exports of the last evaluation of each file of the host, by its
// reference key.
const evaluations = new Map<string, object>();

// The exports that each client reference module stands for: the file's last
// evaluation when the host first asked for the module. The same for the
// module from then on, also after the file was evaluated again for another.
const evaluationOf = new WeakMap<object, object>();

// What stays the same when a file of the app changes: a package, and a module
// of the page (../host-module.ts). React stays, with the roots it made.
const isDependency = ({ id, file }: { id: string; file: string | null }) =>
  isHostModule(id) || (file ?? id).includes("/node_modules/");

// What Next's Flight client of the browser layer reads as `__webpack_require__`
// when it loads, and wraps a property of. A Server Action that a client file
// imports brings that client. A page sets one of its own when it loads
// (`openPage()` in index.ts): one that the graph and a page shared would keep
// the page. A page that is open meanwhile calls the graph's after a load, which
// loads a module as its own does.
const browserRequire = (id: string) => registry.loadBrowserModule(id);

// The URLs of the stylesheets of a client file, from the dev server: see styles.ts.
const stylesheetsOf = (url: string) =>
  askDevServer<string[]>(stylesheetsEvent, { url } satisfies StylesheetsQuestion);

/**
 * Evaluates a file of the host with `"use client"`, at its URL in the browser
 * layer, in the module graph of that layer: the evaluation of the file with
 * the reference key `key`. The module of the rsc layer for the file calls
 * this before its own code runs, as Vitest evaluates what a file imports
 * before it. So a test file with the directive registers its tests with
 * Vitest, which imports the file in the rsc layer, and a setup file with it
 * its hooks.
 *
 * Every time the host imports the file, as Vitest evaluates the file itself
 * every time: a setup file before every test file. What the file imports,
 * once for the graph, as the browser does for what Vitest evaluates in the
 * tab.
 */
export async function loadClientFile(url: string, key: string): Promise<void> {
  // A static build has no dev server to evaluate the file with, nor to ask
  // for its stylesheets.
  if (builtLayers) {
    throw new Error(
      'vitest-plugin-rsc: a static build does not load a file of the host with "use client" yet.',
    );
  }
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
  // The file itself runs every time it loads, as Vitest runs it: its tests,
  // or the hooks of a setup file, are collected as it does.
  const own = evaluatedModules.getModuleByUrl(url);
  if (own) evaluatedModules.invalidateModule(own);
  evaluations.set(key, await graph.import(url));
  await linkStylesheets(await stylesheetsOf(url));
}

/**
 * The module that the host imported, as the host uses it. For a file of the
 * host with `"use client"`, which the rsc layer has as a client reference
 * module, the file's own exports from the browser layer: its last evaluation
 * when the host first asks for the module, which the module made as it
 * loaded unless the host imported the file again since. The same object for
 * the same module, every time. Any other module as it is.
 *
 * Rejects for the client reference module of a file that is not the host's,
 * which nothing evaluated in the browser layer.
 */
export async function loadClientModule<T extends object>(module: T): Promise<T> {
  const key = clientReferenceKeyOf(module);
  if (key === undefined) return module;
  let exports = evaluationOf.get(module);
  if (!exports) {
    exports = evaluations.get(key);
    if (!exports) {
      throw new Error(
        `vitest-plugin-rsc: ${key} has "use client" and is not a file of the host, so nothing ` +
          `loaded it in the browser layer for loadClientModule(). The files of the host are ` +
          `the ones that host.files of vitestPluginNext() matches.`,
      );
    }
    evaluationOf.set(module, exports);
  }
  return exports as T;
}

// The CSS of what a file with `"use client"` imports, linked in the document,
// as a page of the app links its CSS: see styles.ts. Vite's `<style>` of a
// module would stay for the pages of the files after it.
async function linkStylesheets(urls: string[]): Promise<void> {
  const loads = urls.map((href) => {
    const known = linked.get(href);
    if (known) return known.loaded;
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href });
    link.setAttribute(graphStylesheetAttribute, "");
    // A stylesheet that fails to load holds up nothing.
    const loaded = new Promise((resolve) => (link.onload = link.onerror = resolve));
    linked.set(href, { link, loaded });
    document.head.append(link);
    return loaded;
  });
  await Promise.all(loads);
}

/**
 * Takes back the stylesheets that client files linked: the plugin's setup
 * file calls this before every test file. The graph keeps its modules.
 */
export function unlinkClientStylesheets(): void {
  for (const { link } of linked.values()) link.remove();
  linked.clear();
}

/**
 * What a Server Action calls while no page of the app is open. A Server
 * Action that a component of the browser layer calls goes through
 * `callServer()` of Vite RSC, which calls the global `__viteRscCallServer`.
 * A page sets Next's own, which posts to that page (client.tsx). A client
 * file has no page, and the router of a page that was left would never
 * answer. So this one is there from the start, and again once a page is left
 * (`leavePage()` in index.ts).
 */
export async function callServerWithoutPage(id: string): Promise<never> {
  const name = id.split("#").at(-1);
  throw new Error(
    `vitest-plugin-rsc: a component called the Server Action ${name}, and no page of the app ` +
      `is open to post it to. A Server Action needs Next's app, which a file with "use client" ` +
      `does not render in, like a test file with the directive: render the component with ` +
      `renderServer(), from a file without "use client".`,
  );
}

// Before any page: index.ts imports this module, and opens the pages.
globalThis.__viteRscCallServer = callServerWithoutPage;
