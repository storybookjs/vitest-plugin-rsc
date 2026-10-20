// Types `import.meta.hot` below, as Vite gives it a module, without the rest
// of `vite/client`.
/// <reference types="vite/types/importMeta.d.ts" />
import type { EvaluatedModuleNode, ModuleRunner } from "vite/module-runner";
import { clientReferencesId } from "../built-layers.ts";
import { isHostModule } from "../host-module.ts";
import {
  askDevServer,
  checkFetchedModules,
  createEnvironmentRunner,
  environmentModule,
  takeChangedModules,
} from "../utils.ts";
import { buildDirectory, builtFiles } from "./built-files.ts";
import { clientFileKeyExport } from "./client-file-key.ts";
import { registry } from "./registry.ts";
import {
  builtClientStylesheetsOf,
  builtFileKey,
  graphStylesheetAttribute,
  stylesheetOfUrl,
  stylesheetsChangedEvent,
  stylesheetsEvent,
  type StylesheetsQuestion,
} from "./styles-shared.ts";
import { moveLink, stylesheetVersions, type StylesheetVersions } from "./stylesheet-versions.ts";

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
// `loadClientFile()`: once for each version of the file, as the browser
// evaluates a module once. A host that uses the exports of the file, like a
// framework that renders a component of it, gets that evaluation with
// `loadClientModule()`, and a file that imports it here gets the same one.
//
// The CSS of such a file is in the document while the host uses the file, as
// a page's is while the page is open: from `linkStylesheetsOf()` until the
// signal of that use aborts, or `cleanup()`, which ends every use. A
// document can have several uses at once, like the stories of a docs page:
// a stylesheet stays while one of them holds it. Not as the file loads: a host
// may load a file that it does not show yet, as it prepares what it shows
// next. Under Vitest every test uses the setup files and the test file
// (setup.ts).

const environment = "react_client";

let graph: ModuleRunner | undefined;

// A stylesheet that the files of the host linked, and how many uses of
// files hold it: the host's, which a page steps aside for and leaves where it
// is, see document.ts. `href` is the URL of its link, which moves to a later
// version (stylesheet-versions.ts), and `previous` the link it takes the
// place of until it has loaded. `loaded` settles as the link loads or fails,
// and `settle()` as it is unlinked before: a link out of the document fires
// neither `load` nor `error`.
type Linked = {
  href: string;
  link: HTMLLinkElement;
  previous?: HTMLLinkElement;
  loaded: Promise<void>;
  settle: () => void;
  uses: number;
};

// The stylesheets in the document, one for each stylesheet, whatever its
// version: by `stylesheetOfUrl()`, or by the URL of one of a static build.
// Each goes once no use holds it, and `cleanup()` takes them all back.
const linked = new Map<string, Linked>();
const keyOf = (href: string) => stylesheetOfUrl(href) ?? href;

// How many times `cleanup()` ended every use: a use that was asking for its
// stylesheets meanwhile ended with them.
let cleanups = 0;

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

// What the graph keeps when Vite invalidates it: a package, and a module of
// the page (../host-module.ts). React stays, with the roots it made.
const isDependency = ({ id, file }: { id: string; file: string | null }) =>
  isHostModule(id) || (file ?? id).includes("/node_modules/");

// What Next's Flight client of the browser layer reads as `__webpack_require__`
// when it loads, and wraps a property of. A Server Action that a client file
// imports brings that client. A page sets one of its own when it loads
// (`openPage()` in index.ts): one that the graph and a page shared would keep
// the page. A page that is open meanwhile calls the graph's after a load, which
// loads a module as its own does.
const browserRequire = (id: string) => registry.loadBrowserModule(id);

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
 * with it its hooks.
 *
 * Once for each version of the file, as the browser evaluates a module
 * once: a second import of the file gets the evaluation of the first, or
 * its error. A change of the file, or of a module that it imports, is a new
 * version of it, which evaluates the file again, and so is
 * `forgetClientFiles()`, which the plugin's setup file calls before every
 * test file, as Vitest evaluates a setup file and a test file again for
 * each. What the file imports, once for the graph until it changes, as the
 * browser does for what Vitest evaluates in the tab.
 */
export async function loadClientFile(key: string): Promise<void> {
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
    return;
  }
  // A test that fails says where, in the file as it is written.
  graph ??= createEnvironmentRunner(environment, { sourcemaps: true });
  // One at a time: a file that loads meanwhile, like the next one of a
  // change of a module that two files import, waits until the graph has
  // invalidated what changed, or it would import the module as it was.
  const caughtUp = catchingUp.then(() => catchUp(graph!));
  catchingUp = caughtUp.catch(() => {});
  await caughtUp;
  registry.browserRequire = browserRequire;
  // The runner keeps the evaluation of the file until a change, above, or
  // `forgetClientFiles()` invalidated it.
  imported.add(key);
  evaluations.set(key, await graph.import(key));
}

let catchingUp: Promise<void> = Promise.resolve();

// After a change of a file the graph evaluates again what changed: the
// modules that Vite invalidated, the file's and the ones that import them,
// also through others. And the ones that import those here: Vite's stop at
// a module that takes the change of an import itself, with HMR, which the
// graph runs without. Any other module keeps its evaluation, which every
// reader of it shares: a module that imports it here, and
// `loadClientModule()` for the module of a file of the host that did not
// change in the rsc layer.
async function catchUp(graph: ModuleRunner): Promise<void> {
  // The server's modules as they are now: the graph outlives a page load.
  await checkFetchedModules();
  const { evaluatedModules } = graph;
  const changed = new Set<EvaluatedModuleNode>();
  const add = (id: string) => {
    const node = evaluatedModules.getModuleById(id);
    if (node && !isDependency(node)) changed.add(node);
  };
  for (const id of await takeChangedModules(graph)) add(id);
  for (const node of changed) node.importers.forEach(add);
  for (const node of changed) evaluatedModules.invalidateModule(node);
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

/**
 * Links the stylesheets of files of the host with `"use client"` that the
 * host uses, like a framework that renders a component of one, or one that
 * renders as it loads: what each imports in the browser layer, in their
 * order, as they are now. The files as for `hostFiles` of `renderServer()`:
 * absolute, or from the root of the project. Resolves once the stylesheets
 * have loaded.
 *
 * The use ends as `signal` aborts, and without one at `cleanup()`, which ends
 * every use: a stylesheet goes once no use holds it. An aborted signal links
 * nothing, and a use whose signal aborts rejects at once with the signal's
 * reason, as `renderServer()` does.
 */
export async function linkStylesheetsOf(
  hostFiles: string[],
  { signal }: { signal?: AbortSignal } = {},
): Promise<void> {
  signal?.throwIfAborted();
  const cleanupsBefore = cleanups;
  const urls = await stylesheetsOfHostFiles(hostFiles);
  signal?.throwIfAborted();
  if (cleanups !== cleanupsBefore) return;
  const held = urls.map(hold);
  const loaded = Promise.all(held.map((stylesheet) => stylesheet.loaded));
  if (!signal) return void (await loaded);
  const ended = new Promise<void>((resolve) =>
    signal.addEventListener(
      "abort",
      () => {
        held.forEach(release);
        resolve();
      },
      { once: true },
    ),
  );
  await Promise.race([loaded, ended]);
  signal.throwIfAborted();
}

// The URLs of the stylesheets of files of the host by their paths: from the
// dev server, see styles.ts, or from the files of a static build.
async function stylesheetsOfHostFiles(hostFiles: string[]): Promise<string[]> {
  if (hostFiles.length === 0) return [];
  if (!buildDirectory) {
    return askDevServer<string[]>(stylesheetsEvent, { hostFiles } satisfies StylesheetsQuestion);
  }
  // Of a file with `"use client"`, as the dev server answers.
  const built = await builtFiles();
  const urls = hostFiles.flatMap((file) => {
    const key = builtFileKey(file, built.clientFiles);
    return key === undefined ? [] : builtClientStylesheetsOf(built, key, buildDirectory!);
  });
  return [...new Set(urls)];
}

// The CSS of what a file with `"use client"` imports, its own too, linked in
// the document, as a page of the app links its CSS: see styles.ts. Vite's
// `<style>` of a module would stay for every file after it, and the `<link>`
// of a chunk of a build goes with a page that is open as the file loads. A
// use of a stylesheet that is linked already, in another version, moves it
// to this one, as it is now.
function hold(href: string): Linked {
  const known = linked.get(keyOf(href));
  if (known) {
    known.uses++;
    if (known.href !== href) move(known, href);
    return known;
  }
  const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href });
  link.setAttribute(graphStylesheetAttribute, "");
  const stylesheet: Linked = { href, link, uses: 1, ...loading(link) };
  linked.set(keyOf(href), stylesheet);
  document.head.append(link);
  return stylesheet;
}

// A stylesheet that fails to load holds up nothing.
function loading(link: HTMLLinkElement): Pick<Linked, "loaded" | "settle"> {
  let settle!: () => void;
  const loaded = new Promise<void>((resolve) => {
    settle = () => resolve();
    link.addEventListener("load", settle, { once: true });
    link.addEventListener("error", settle, { once: true });
  });
  return { loaded, settle };
}

// Moves the link of a stylesheet to `href`. One that a page has parked out of
// the document gets the URL, and loads it once it is back.
function move(stylesheet: Linked, href: string): void {
  const link = moveLink(stylesheet.link, href);
  stylesheet.href = href;
  if (link === stylesheet.link) return;
  stylesheet.settle();
  stylesheet.previous = stylesheet.link;
  stylesheet.link = link;
  Object.assign(stylesheet, loading(link));
}

/**
 * Moves the stylesheets that the files of the host linked to the versions of
 * now, after a change of their CSS: see stylesheet-versions.ts.
 */
export function moveGraphLinks(versions: StylesheetVersions): void {
  for (const [key, stylesheet] of linked) {
    const href = versions.get(key);
    if (href !== undefined && href !== stylesheet.href) move(stylesheet, href);
  }
}
// With a dev server, after each change of such CSS (styles.ts), in either
// entry of the plugin: a host that only links the files' CSS has no page.
import.meta.hot?.on(stylesheetsChangedEvent, (urls: string[]) =>
  moveGraphLinks(stylesheetVersions(urls)),
);

// The end of one use of a stylesheet. Not of one that `cleanup()` took back
// meanwhile, which a later use may have linked again.
function release(stylesheet: Linked): void {
  if (linked.get(keyOf(stylesheet.href)) !== stylesheet) return;
  if (--stylesheet.uses === 0) unlink(stylesheet);
}

// Also one that a page that is open has parked: it is no longer the host's,
// and leaving the page does not put it back (document.ts).
function unlink(stylesheet: Linked): void {
  for (const link of [stylesheet.link, stylesheet.previous]) {
    link?.remove();
    link?.removeAttribute(graphStylesheetAttribute);
  }
  linked.delete(keyOf(stylesheet.href));
  stylesheet.settle();
}

/**
 * Unlinks the stylesheets of the files of the host, which ends every use of
 * them: `cleanup()` calls this, once it has left the page.
 */
export function unlinkStylesheets(): void {
  cleanups++;
  for (const stylesheet of linked.values()) unlink(stylesheet);
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
  unlinkStylesheets();
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
