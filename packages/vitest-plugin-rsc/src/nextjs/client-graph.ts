import type { ModuleRunner } from "vite/module-runner";
import { clientReferencesId } from "../built-layers.ts";
import { isHostModule } from "../host-module.ts";
import {
  askDevServer,
  checkFetchedModules,
  createEnvironmentRunner,
  environmentModule,
  takeFetchedModules,
} from "../utils.ts";
import { buildDirectory, builtFiles } from "./built-files.ts";
import { clientFileKeyExport } from "./client-file-key.ts";
import { registry } from "./registry.ts";
import {
  builtClientStylesheetsOf,
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
// `loadClientFile()`: once for each version of the graph, as the browser
// evaluates a module once. A host that uses the exports of the file, like a
// framework that renders a component of it, gets that evaluation with
// `loadClientModule()`.

const environment = "react_client";

let graph: ModuleRunner | undefined;

// The stylesheets that the files of the host linked, one for each URL: the
// tab's, which a page that comes and goes leaves where they are, see
// document.ts. `forgetClientFiles()` takes them back.
const linked = new Map<string, { link: HTMLLinkElement; loaded: Promise<unknown> }>();

// The exports of the evaluation of each file of the host that the graph has
// now, by its reference key.
const evaluations = new Map<string, object>();

// The URLs of the files of the host that the graph imported, also one whose
// evaluation failed, which the runner keeps as it does an evaluation:
// `forgetClientFiles()` has the graph evaluate each again.
const imported = new Set<string>();

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

// The URLs of the stylesheets of a client file: from the dev server, by its
// URL, see styles.ts. A static build has them in a file, by the path of the
// file from the root of the project.
async function stylesheetsOf(key: string, builtFile: string | undefined): Promise<string[]> {
  if (!buildDirectory) {
    return askDevServer<string[]>(stylesheetsEvent, { url: key } satisfies StylesheetsQuestion);
  }
  if (builtFile === undefined) return [];
  return builtClientStylesheetsOf(await builtFiles(), builtFile, buildDirectory);
}

// In a static build: the modules of the browser layer that a Flight payload
// can refer to, by their reference keys, which the graph evaluates a client
// file from.
type ClientReferences = { default: Record<string, () => Promise<object>> };

/**
 * Evaluates a file of the host with `"use client"` in the module graph of
 * the browser layer: the file with the reference key `key`, which with a dev
 * server is its URL in that layer. The module of the rsc layer for the file
 * calls this before its own code runs, as Vitest evaluates what a file
 * imports before it. So a test file with the directive registers its tests
 * with Vitest, which imports the file in the rsc layer, and a setup file
 * with it its hooks. In a static build `builtFile` is the key of its
 * stylesheets there: see `clientFileCode()` in client-files.ts.
 *
 * Once for each version of the graph, as the browser evaluates a module
 * once: a second import of the file gets the evaluation of the first, or
 * its error. A change of a module of the browser layer, the file's own
 * too, is a new version, which evaluates the file again, and so is
 * `forgetClientFiles()`, which the plugin's setup file calls before every
 * test file, as Vitest evaluates a setup file and a test file again for
 * each. What the file imports, once for the graph, as the
 * browser does for what Vitest evaluates in the tab.
 */
export async function loadClientFile(key: string, builtFile?: string): Promise<void> {
  if (buildDirectory) {
    graph ??= createEnvironmentRunner(environment);
    const references = await graph.import<ClientReferences>(
      environmentModule(environment, clientReferencesId),
    );
    const load = references.default[key];
    if (!load) throw new Error(`vitest-plugin-rsc: the build has no client reference "${key}"`);
    registry.browserRequire = browserRequire;
    // Once for the document: a build has no change, and the runner
    // evaluates the module that the list imports once.
    evaluations.set(key, await load());
    await linkStylesheets(await stylesheetsOf(key, builtFile));
    return;
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
  // The runner keeps the evaluation of the file until a change, above, or
  // `forgetClientFiles()` invalidated it.
  imported.add(key);
  evaluations.set(key, await graph.import(key));
  await linkStylesheets(await stylesheetsOf(key, builtFile));
}

/**
 * The module that the host imported, as the host uses it. For a file of the
 * host with `"use client"`, which the rsc layer has as a client reference
 * module, the file's own exports from the browser layer: the evaluation the
 * graph has when the host first asks for the module, the one that the
 * module's line loaded unless the graph evaluated the file again since. The
 * same object for the same module, every time. Such a module has the export
 * `clientFileKeyExport`, which the plugin put in front of it, and that alone
 * tells it: other exports, like one that a plugin of the host adds, change
 * nothing. Any other module as it is.
 *
 * Rejects for the client reference module of a file that is not the host's,
 * which nothing evaluated in the browser layer.
 */
export async function loadClientModule<T extends object>(module: T): Promise<T> {
  const key: unknown = Reflect.get(module, clientFileKeyExport);
  if (typeof key !== "string") return module;
  let exports = evaluationOf.get(module);
  if (!exports) {
    exports = evaluations.get(key);
    if (!exports) {
      throw new Error(
        `vitest-plugin-rsc: ${key} has "use client" and is not a file of the host, so nothing ` +
          `loaded it in the browser layer for loadClientModule(). ${key} is the reference key ` +
          `that Vite RSC gives the file: its URL with a dev server, and in a static build a ` +
          `hash of the file. The files of the host are the ones that host.files of ` +
          `vitestPluginNext() matches.`,
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
 * Forgets what the files of the host did in the tab: with a dev server the
 * graph evaluates each again the next time it loads, also one that failed,
 * and the stylesheets they linked go. The plugin's setup file calls this before every test file,
 * under Vitest. The graph keeps what the files import, and a module whose
 * line ran before still gets the evaluation it loaded.
 */
export function forgetClientFiles(): void {
  for (const url of imported) {
    const own = graph?.evaluatedModules.getModuleByUrl(url);
    if (own) graph?.evaluatedModules.invalidateModule(own);
  }
  imported.clear();
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
