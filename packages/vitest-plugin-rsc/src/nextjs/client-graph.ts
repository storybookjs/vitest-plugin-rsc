import type { Container, Root } from "react-dom/client";
import type { ModuleRunner } from "vite/module-runner";
import { commands } from "vitest/browser";
import { isHostModule } from "../host-module.ts";
import { checkFetchedModules, createEnvironmentRunner, takeFetchedModules } from "../utils.ts";
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
// What each client file linked, to take it back: see `unloadClientFile()`.
const linked = new Map<string, () => void>();
// The React roots of the graph, with their containers: see `unmountClientRoots()`.
const roots = new Map<Root, Container>();

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
 * Evaluates a file with `"use client"` in the module graph of the browser
 * layer, and answers with what it exports. `id` is what the browser layer
 * imports the file by. The module of the rsc layer for such a file calls
 * this, so Vitest, which imports the file there, gets these exports.
 */
export function loadClientFile(id: string): Promise<Record<string, unknown>> {
  const loaded = loading.then(() => load(id));
  loading = loaded.catch(() => {});
  return loaded;
}

async function load(id: string): Promise<Record<string, unknown>> {
  // The server's modules as they are now: the graph outlives a page load.
  await checkFetchedModules();
  if (!graph) {
    // A test that fails says where, in the file as it is written.
    graph = createEnvironmentRunner(environment, { sourcemaps: true });
    await recordRoots(graph);
  }
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
  const file = evaluatedModules.getModuleByUrl(id);
  if (file) evaluatedModules.invalidateModule(file);
  registry.browserRequire = browserRequire;
  serverActionsNeedTheApp();
  const exports = await graph.import<Record<string, unknown>>(id);
  linked.get(id)?.();
  linked.set(id, await linkStylesheets());
  return exports;
}

// Before anything renders with it: React DOM of the graph says what roots it
// makes. A module that imports it reads `createRoot` off it.
async function recordRoots(runner: ModuleRunner): Promise<void> {
  const { default: client } = await runner.import<{ default: typeof import("react-dom/client") }>(
    "react-dom/client",
  );
  const { createRoot, hydrateRoot } = client;
  const record = (root: Root, container: Container) => (roots.set(root, container), root);
  client.createRoot = (container, options) => record(createRoot(container, options), container);
  client.hydrateRoot = (container, children, options) =>
    record(hydrateRoot(container, children, options), container);
}

/**
 * Unmounts what the components of a client file rendered, after a test as a
 * page is left. A library that renders, like vitest-browser-react, unmounts
 * its own before every test of the file it loads in, and in the graph it
 * loads once, for every file. A container in the body goes, as such a
 * library takes away the one it made.
 */
export function unmountClientRoots(): void {
  for (const [root, container] of roots) {
    root.unmount();
    if (container.parentNode === document.body) (container as Element).remove();
  }
  roots.clear();
}

// The CSS of what a client file imports, linked in the document until the
// file is done, as a page of the app links its CSS: see styles.ts. Vite's
// `<style>` of a module would stay for the pages of the files after it.
async function linkStylesheets(): Promise<() => void> {
  const urls = await (commands as unknown as Record<string, () => Promise<string[]>>)[
    clientFileStylesheetsCommand
  ]!();
  const links = urls.map((href) =>
    Object.assign(document.createElement("link"), { rel: "stylesheet", href }),
  );
  // A stylesheet that fails to load holds up nothing.
  const loaded = links.map(
    (link) => new Promise((resolve) => (link.onload = link.onerror = resolve)),
  );
  document.head.append(...links);
  await Promise.all(loaded);
  return () => links.forEach((link) => link.remove());
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

/**
 * Takes back what `loadClientFile()` linked for a client file: its tests are
 * done. The graph keeps its modules.
 */
export function unloadClientFile(id: string): void {
  linked.get(id)?.();
  linked.delete(id);
}

/**
 * Takes back what every client file but the one `id` names linked. Vitest
 * runs no hook of a file whose tests are all skipped, like with `-t` or
 * `describe.skip`, so that one is done when the file after it starts.
 */
export function unloadClientFilesExcept(id: string): void {
  for (const file of linked.keys()) if (file !== id) unloadClientFile(file);
}
