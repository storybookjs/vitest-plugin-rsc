import type { ModuleRunner } from "vite/module-runner";
import { commands } from "vitest/browser";
import { isHostModule } from "../host-module.ts";
import { checkFetchedModules, createEnvironmentRunner, takeFetchedModules } from "../utils.ts";
import { clientFileId } from "./client-ids.ts";
import { registry } from "./registry.ts";
import { clientFileStylesheetsCommand } from "./styles-command.ts";

// A test file with `"use client"` is a client boundary: code of the browser
// layer, see client-files.ts. Its tests render a Client Component as React
// does, with `render()` of vitest-browser-react or of Testing Library. There
// is no page of the app, no request and no router of Next.
//
// So the files are evaluated in one module graph of the browser layer, which
// lives as long as the tab, as the modules of a test do without Next. What a
// file imports loads there once, with Next's React for the browser, and so
// does the library that renders. Every page of the app has a graph of its
// own (`openPage()` in index.ts), which this one shares no module with.

const environment = "react_client";

let graph: ModuleRunner | undefined;
// One file at a time: a file that loads may have the graph evaluate its
// modules again.
let loading: Promise<unknown> = Promise.resolve();
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
 * Evaluates `file`, a test file with `"use client"`, in the module graph of
 * the browser layer, with its tests. The module of the rsc layer for such a
 * file calls this, so the tests go to Vitest, which imports the file there.
 */
export function loadClientFile(file: string): Promise<void> {
  const loaded = loading.then(() => load(file));
  loading = loaded.catch(() => {});
  return loaded;
}

async function load(file: string): Promise<void> {
  // The server's modules as they are now: the graph outlives a page load.
  await checkFetchedModules();
  // A test that fails says where, in the file as it is written.
  graph ??= createEnvironmentRunner(environment, { sourcemaps: true });
  const { evaluatedModules } = graph;
  // After a change of a file the graph evaluates the modules of the app
  // again, as a page load does: the server cannot tell which of them
  // changed, as another runner may have fetched them again already.
  if (await takeFetchedModules(graph)) {
    for (const node of evaluatedModules.idToModuleMap.values()) {
      if (!isDependency(node)) evaluatedModules.invalidateModule(node);
    }
  }
  // The file itself runs every time it loads: its tests are collected as it
  // does, as in watch mode.
  const id = clientFileId(file);
  const loaded = evaluatedModules.getModuleByUrl(id);
  if (loaded) evaluatedModules.invalidateModule(loaded);
  registry.browserRequire = browserRequire;
  serverActionsNeedTheApp();
  await graph.import(id);
  await linkStylesheets(file);
}

// The libraries that render a component as React does, by their package.
// Each keeps the roots it made, and unmounts them with its `cleanup()`. Vite
// pre-bundles a package into a file of its name, with `_` for a `/`.
const renderers = ["vitest-browser-react", "@testing-library/react"];
const isRenderer = (file: string) =>
  renderers.some(
    (name) =>
      file.includes(`/node_modules/${name}/`) || file.endsWith(`/${name.replace("/", "_")}.js`),
  );

/**
 * Has the libraries that rendered in the graph unmount what they rendered,
 * around every test. They would do it themselves with a test runner that
 * evaluates them for every test file: vitest-browser-react in a `beforeEach()`
 * it registers as it loads, and the graph loads it once, for every file.
 * Testing Library only with Vitest's globals. What a library renders itself,
 * like a toast into a root it keeps, stays the library's.
 *
 * Not through what vitest-browser-react gives the page for Vitest to clean
 * up with, `Symbol.for("vitest:component-cleanup")`: Vitest calls that once,
 * when the tab is done, and the `page.extend()` of `@vitest/browser` 5.0
 * leaves out a key that is a symbol.
 */
export async function cleanupClientRenders(): Promise<void> {
  if (!graph) return;
  const cleanups = new Set<() => unknown>();
  for (const { file, exports } of graph.evaluatedModules.idToModuleMap.values()) {
    const cleanup = (exports as { cleanup?: unknown } | undefined)?.cleanup;
    if (typeof cleanup === "function" && isRenderer(file)) cleanups.add(cleanup as () => unknown);
  }
  for (const cleanup of cleanups) await cleanup();
}

// The CSS of what a client file imports, linked in the document, as a page of
// the app links its CSS: see styles.ts. Vite's `<style>` of a module would
// stay for the pages of the files after it.
async function linkStylesheets(file: string): Promise<void> {
  const urls = await (commands as unknown as Record<string, (file: string) => Promise<string[]>>)[
    clientFileStylesheetsCommand
  ]!(file);
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
