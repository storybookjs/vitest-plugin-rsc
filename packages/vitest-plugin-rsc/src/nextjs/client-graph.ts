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
//
// The CSS of such a file is in the document while the host uses the file, as
// a page's is while the page is open: from `linkStylesheetsOf()` until
// `cleanup()`, which ends what the host used. Not as the file loads: a host
// may load a file that it does not use yet, as Storybook preloads the file
// of a story. Under Vitest every test uses the setup files and the test file
// (setup.ts).

const environment = "react_client";

let graph: ModuleRunner | undefined;

// The stylesheets that the files of the host linked, one for each URL: the
// host's, which a page steps aside for and leaves where they are, see
// document.ts. `cleanup()` takes them back.
const linked = new Map<string, { link: HTMLLinkElement; loaded: Promise<unknown> }>();

// Each file of the host that the graph loaded, by its reference key: the key
// of its stylesheets in a static build, and their URLs as the graph last
// linked them.
const files = new Map<string, { builtFile: string | undefined; stylesheets?: string[] }>();

// The reference keys of the files that the host uses now: `linked` has their
// stylesheets.
const used = new Set<string>();

// The exports of the evaluation of each file of the host that the graph has
// now, by its reference key.
const evaluations = new Map<string, object>();

// The reference keys of the files of the host that the graph loaded since
// `forgetClientFiles()`, also one whose evaluation failed, which the runner
// keeps as it does an evaluation: with a dev server, their URLs, which
// `forgetClientFiles()` has the graph evaluate again.
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
    imported.add(key);
    // Once for the document: a build has no change, and the runner
    // evaluates the module that the list imports once.
    files.set(key, { builtFile });
    evaluations.set(key, await load());
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
  const changed = await takeFetchedModules(graph);
  if (changed) {
    for (const node of evaluatedModules.idToModuleMap.values()) {
      if (!isDependency(node)) evaluatedModules.invalidateModule(node);
    }
  }
  registry.browserRequire = browserRequire;
  // The runner keeps the evaluation of the file until a change, above, or
  // `forgetClientFiles()` invalidated it.
  imported.add(key);
  files.set(key, { builtFile });
  evaluations.set(key, await graph.import(key));
  if (changed) await linkUsedFilesAgain();
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
 * nothing. Any other module as it is. Links nothing: a host that uses the
 * file links its stylesheets with `linkStylesheetsOf()`.
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
          `loaded it in the browser layer. ${key} is the reference key ` +
          `that Vite RSC gives the file: its URL with a dev server, and in a static build a ` +
          `hash of the file. The files of the host are the ones that host.files of ` +
          `vitestPluginNext() matches.`,
      );
    }
    evaluationOf.set(module, exports);
  }
  return exports as T;
}

/**
 * Links the stylesheets of the file of `module` in the document, those of
 * what it imports in the browser layer, until `cleanup()` unlinks them: what
 * a host calls as it uses the file, like a framework that shows a story of
 * it, or renders it as it loads. As they are now: with a dev server, an edit
 * since the file loaded gives one another version. Resolves once they have
 * loaded. Nothing for a module that `loadClientModule()` gives as it is, and
 * rejects where it rejects.
 */
export async function linkStylesheetsOf(module: object): Promise<void> {
  await loadClientModule(module);
  const key: unknown = Reflect.get(module, clientFileKeyExport);
  if (typeof key !== "string") return;
  used.add(key);
  await linkStylesheets(await stylesheetsOfFile(key, { again: true }));
}

// The URLs of the stylesheets of a file that the graph loaded: those it last
// linked, unless they are asked for `again`.
async function stylesheetsOfFile(key: string, { again }: { again: boolean }): Promise<string[]> {
  const file = files.get(key)!;
  if (again || !file.stylesheets) file.stylesheets = await stylesheetsOf(key, file.builtFile);
  return file.stylesheets;
}

// The CSS of what a file with `"use client"` imports, its own too, linked in
// the document, as a page of the app links its CSS: see styles.ts. Vite's
// `<style>` of a module would stay for every file after it, and the `<link>`
// of a chunk of a build goes with a page that is open as the file loads.
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
 * Unlinks the stylesheets of the files of the host: `cleanup()` calls this,
 * once it has left the page.
 */
export function unlinkClientStylesheets(): void {
  for (const { link } of linked.values()) link.remove();
  linked.clear();
  used.clear();
}

// After a change, the stylesheets of the files in use as they are now, as
// Vite puts the new CSS of a module in its `<style>`: an edit gives a
// stylesheet another version, and the one before goes.
async function linkUsedFilesAgain(): Promise<void> {
  const urls = await Promise.all([...used].map((key) => stylesheetsOfFile(key, { again: true })));
  const now = new Set(urls.flat());
  for (const [href, { link }] of linked) {
    if (now.has(href)) continue;
    link.remove();
    linked.delete(href);
  }
  await linkStylesheets([...now]);
}

/**
 * Links the stylesheets of every file of the host that the graph loaded
 * since `forgetClientFiles()`. Under Vitest those are the setup files and
 * the test file with `"use client"`, which every test uses: the plugin's
 * setup file calls this before the tests of a file, and again before each,
 * after `cleanup()`. Asks for a file's once: a change of one runs the test
 * file again.
 */
export async function linkClientStylesheets(): Promise<void> {
  for (const key of imported) used.add(key);
  // In the order the files loaded, as their CSS cascades.
  const urls = await Promise.all(
    [...imported].map((key) => stylesheetsOfFile(key, { again: false })),
  );
  await linkStylesheets(urls.flat());
}

/**
 * Forgets what the files of the host did in the tab: with a dev server the
 * graph evaluates each again the next time it loads, also one that failed,
 * and the stylesheets they linked go. The plugin's setup file calls this
 * before every test file, under Vitest. The graph keeps what the files
 * import, and a module whose line ran before still gets the evaluation it
 * loaded.
 */
export function forgetClientFiles(): void {
  for (const url of imported) {
    const own = graph?.evaluatedModules.getModuleByUrl(url);
    if (own) graph?.evaluatedModules.invalidateModule(own);
  }
  imported.clear();
  unlinkClientStylesheets();
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
