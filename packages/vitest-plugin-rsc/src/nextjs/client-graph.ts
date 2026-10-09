import {
  ssrDynamicImportKey,
  ssrImportKey,
  type ModuleEvaluator,
  type ModuleRunner,
} from "vite/module-runner";
import { isHostModule } from "../host-module.ts";
import { checkFetchedModules, createEnvironmentRunner, createEvaluator } from "../utils.ts";
import { isLiveModule } from "./client-ids.ts";
import { recordListeners, recordMessageChannels, type Leftovers } from "./leftovers.ts";
import { registry } from "./registry.ts";

// A test file or a story file with `"use client"` is code of the browser
// layer: see client-files.ts. That layer has a module graph for every page
// load, since Next's client starts once in a graph. But a test file is
// evaluated once, and its tests render in page after page.
//
// So the file is evaluated on its own, and what it imports is not: an import
// is a view on the module of that name in the graph of the page. A module
// runner compiles the use of an import to a read of a property, so a test
// that says `<Button />` reads `Button`, and `jsxDEV`, at that moment, from
// the graph the page has. The component it renders is the page's own, with
// the page's React and the page's router. (What the file imports is a module
// in between, for the imports Vite would compile to a constant: see
// client-files.ts.)
//
// There is one such graph at a time, with the imports of the client files in
// it. A page that loads takes it. When that page is left there is a new one,
// before the test goes on. What is not read again stays what it was: a value
// that the file kept when it loaded, like `memo(Button)` in a constant, or an
// element that was made before the page was left.

type Loaded = { exports: Record<PropertyKey, unknown> } | { error: unknown };

/** The module graph of the browser layer for one page load. */
export type PageGraph = {
  runner: ModuleRunner;
  /**
   * What its modules left behind when they loaded, before the page did: see
   * leftovers.ts. Removed when the page is left.
   */
  leftovers: Leftovers[];
};

type Graph = PageGraph & {
  /** The imports of the client files, by what they are imported by. */
  modules: Map<string, Loaded>;
  /** What those export, to tell a node that was made with another graph. */
  exported: WeakSet<object>;
  /** A page has loaded in it: the next page gets another. */
  taken: boolean;
};

const environment = "react_client";

// The graph of the page that is there, or of the next one.
let current: Graph | undefined;
// What each client file imports. A file that is loaded again starts over.
const files = new Map<string, Set<string>>();
// The runner of each client file. Its source maps are for the stacks of the
// whole page, until it is closed: see `unloadClientFile()`.
const fileRunners = new Map<string, ModuleRunner>();

const isObject = (value: unknown): value is object =>
  (typeof value === "object" && value !== null) || typeof value === "function";

// How a page evaluates a module. A client file is a module of the page too,
// when a host has the page import it, as Storybook does for a story. Its
// imports are of the modules in between, and there it gets what they hold.
function pageEvaluator(): ModuleEvaluator {
  const evaluator = createEvaluator();
  const unwrap = async (dep: string, loading: Promise<{ module?: unknown }>) =>
    isLiveModule(dep) ? (await loading).module : loading;
  return {
    ...evaluator,
    runInlinedModule(context, code, module) {
      const request = context[ssrImportKey];
      const dynamicRequest = context[ssrDynamicImportKey];
      return evaluator.runInlinedModule(
        {
          ...context,
          [ssrImportKey]: (dep, metadata) => unwrap(dep, request(dep, metadata)),
          [ssrDynamicImportKey]: (dep, options) =>
            unwrap(String(dep), dynamicRequest(dep, options)),
        },
        code,
        module,
      );
    },
  };
}

function createPageGraph(): PageGraph {
  // The browser's Flight client reads properties off `__webpack_require__`
  // when it loads, which is before the page can say how it loads a module,
  // and wraps some of them. One that the pages shared would keep every page.
  registry.browserRequire = (id) => registry.loadBrowserModule(id);
  return { runner: createEnvironmentRunner(environment, pageEvaluator()), leftovers: [] };
}

const createGraph = (): Graph => ({
  ...createPageGraph(),
  modules: new Map(),
  exported: new WeakSet(),
  taken: false,
});

// One at a time: what a module leaves behind is recorded while it loads. That
// includes a listener on `window` that a module of the app adds as it loads,
// which a page that loads on its own keeps: see `openPage()` in index.ts.
let loading: Promise<void> = Promise.resolve();

function load(graph: Graph, module: string): Promise<void> {
  const next = loading.then(async () => {
    const leftovers = [recordListeners(window), recordMessageChannels()];
    graph.leftovers.push(...leftovers);
    let loaded: Loaded;
    try {
      const namespace = await graph.runner.import<Record<PropertyKey, unknown>>(module);
      // The module in between has the namespace of the import as an export.
      const exports = isLiveModule(module) ? namespace.module : namespace;
      loaded = { exports: exports as Record<PropertyKey, unknown> };
      for (const value of Object.values(loaded.exports)) {
        if (isObject(value)) graph.exported.add(value);
      }
    } catch (error) {
      // The file that reads it gets the error, as the page would.
      loaded = { error };
    }
    for (const leftover of leftovers) leftover.stop();
    graph.modules.set(module, loaded);
  });
  loading = next;
  return next;
}

// A graph that no page took has nobody else to take back what it left.
function drop(graph: Graph): void {
  for (const leftover of graph.leftovers) leftover.remove();
}

// Until the graph that is current has it: a page can be left in the meantime.
async function ensure(module: string): Promise<void> {
  for (let graph = current; graph && !graph.modules.has(module); graph = current) {
    await load(graph, module);
  }
}

function exportsOf(module: string): Record<PropertyKey, unknown> {
  const loaded = current?.modules.get(module);
  if (!loaded)
    throw new Error(`vitest-plugin-rsc: ${module} is not in the module graph of the page`);
  if ("error" in loaded) throw loaded.error;
  return loaded.exports;
}

// What a client file gets for an import: the exports of that module in the
// graph that is current when they are read.
function view(module: string): object {
  return new Proxy(Object.create(null) as object, {
    get: (_, key) => exportsOf(module)[key],
    has: (_, key) => key in exportsOf(module),
    ownKeys: () => Reflect.ownKeys(exportsOf(module)),
    getOwnPropertyDescriptor(_, key) {
      const exports = exportsOf(module);
      if (!Object.hasOwn(exports, key)) return;
      return { value: exports[key], enumerable: true, configurable: true, writable: false };
    },
  });
}

// Evaluates a client file. What it imports from the host is the page's own
// module, which the runner imports as it is. Everything else is a module of
// the page's graph.
function clientFileEvaluator(imported: (module: string) => Promise<object>): ModuleEvaluator {
  const evaluator = createEvaluator();
  return {
    ...evaluator,
    runInlinedModule(context, code, module) {
      const request = context[ssrImportKey];
      const dynamicRequest = context[ssrDynamicImportKey];
      return evaluator.runInlinedModule(
        {
          ...context,
          [ssrImportKey]: (dep, metadata) =>
            isHostModule(dep) ? request(dep, metadata) : imported(dep),
          [ssrDynamicImportKey]: (dep, options) => {
            // Relative only when Vite could not tell what is imported.
            const target = /^\.\.?\//.test(String(dep))
              ? new URL(dep, new URL(module.url, "file:///")).pathname
              : String(dep);
            return isHostModule(target) ? dynamicRequest(dep, options) : imported(target);
          },
        },
        code,
        module,
      );
    },
  };
}

// A UI of the host that renders with React DOM in the document, like the docs
// pages of Storybook, is code of the browser layer too. It has a module graph
// of its own, which lives as long as the document: a page load of the app
// takes the graph of the pages, and so does a client file, which reads from
// the page that is open. This one keeps its React, and the roots that its
// React DOM made. It has no hot updates of its own: a file that the rsc layer
// evaluated again, after a change, is evaluated again here when its export is
// asked for.
let hostGraph: ModuleRunner | undefined;
// The exports of the host graph, by what the rsc layer has for each.
const hostExports = new WeakMap<object, Promise<unknown>>();
// For each file, which load of it in the rsc layer the host graph has.
const hostLoads = new Map<string, object>();

async function importInHostGraph(module: string, reload: boolean) {
  const graph = (hostGraph ??= createEnvironmentRunner(environment, pageEvaluator()));
  const loaded = reload && graph.evaluatedModules.getModuleByUrl(module);
  if (loaded) {
    // The server's modules after the change, of which the graph has some of
    // before: it asks the server for each from then on, see
    // `createEnvironmentRunner()`.
    await checkFetchedModules();
    graph.evaluatedModules.invalidateModule(loaded);
  }
  return graph.import<Record<string, unknown>>(module);
}

/**
 * What an export of a file of the browser layer is in a module graph that
 * lives as long as the document: an export of a file with `"use client"`, or
 * the stand-in for an export of a file of `host.ui.files`. Anything else is
 * itself.
 */
export function importForHost<T>(value: T): Promise<T> {
  const file = isObject(value) ? registry.clientExports.get(value) : undefined;
  if (!file) return Promise.resolve(value);
  let found = hostExports.get(file);
  if (!found) {
    const loaded = hostLoads.get(file.module);
    hostLoads.set(file.module, file.load);
    found = importInHostGraph(file.module, loaded !== undefined && loaded !== file.load).then(
      (exports) => exports[file.name],
    );
    // A file that failed to load is loaded anew the next time.
    found.catch(() => {
      hostExports.delete(file);
      if (hostLoads.get(file.module) === file.load) hostLoads.set(file.module, {});
    });
    hostExports.set(file, found);
  }
  return found as Promise<T>;
}

/**
 * Evaluates a file with `"use client"` for the browser layer, and answers
 * with what it exports. `id` is what the browser layer imports the
 * file by. The module of the rsc layer for such a file calls this, so a host
 * that imports the file gets these exports.
 */
export async function loadClientFile(id: string): Promise<Record<string, unknown>> {
  const imports = new Set<string>();
  // Set while it loads: a page that is left in the meantime gives the next
  // one what the file has imported so far.
  files.set(id, imports);
  current ??= createGraph();
  await fileRunners.get(id)?.close();
  const runner = createEnvironmentRunner(
    environment,
    clientFileEvaluator(async (module) => {
      imports.add(module);
      await ensure(module);
      return view(module);
    }),
    // A test that fails says where, in the file as it is written.
    { sourcemaps: true },
  );
  fileRunners.set(id, runner);
  let exports: Record<string, unknown>;
  try {
    exports = await runner.import<Record<string, unknown>>(id);
  } catch (error) {
    // The stack, with the lines of the file, before its runner is closed.
    if (error instanceof Error) void error.stack;
    // The pages after it do not load what a file that failed imports.
    if (files.get(id) === imports) unloadClientFile(id);
    throw error;
  }
  const load = {};
  for (const [name, value] of Object.entries(exports)) {
    if (isObject(value)) registry.clientExports.set(value, { module: id, name, load });
  }
  return exports;
}

/**
 * Forgets a client file that `loadClientFile()` loaded. The pages
 * that load from here on do not load what it imports. Its tests are done.
 */
export function unloadClientFile(id: string): void {
  const runner = fileRunners.get(id);
  fileRunners.delete(id);
  // Not awaited: it has nothing to disconnect.
  void runner?.close();
  if (!files.delete(id) || files.size > 0 || !current || current.taken) return;
  drop(current);
  current = undefined;
}

/**
 * The module graph for a page that loads. With a client file loaded it is the
 * one that file imports from, so that a test and the page it renders have the
 * same modules. Without one the page has a graph to itself.
 */
export function takeGraph(): PageGraph {
  if (!current) return createPageGraph();
  current.taken = true;
  return current;
}

/**
 * Call when a page is left. The page had the graph, so the client files get
 * another one, with everything they import in it. Once this resolves, what a
 * client file reads from an import is of the next page.
 */
export async function leaveGraph(): Promise<void> {
  const left = current;
  if (!left?.taken) return;
  // What its modules left behind. The page took most of it back, but not
  // what a client file loaded in it after the page had left.
  const replace = (next: Graph | undefined) => {
    current = next;
    drop(left);
  };
  if (files.size === 0) {
    replace(undefined);
    return;
  }
  const next = createGraph();
  // In the order the files import them, as when the files were evaluated. A
  // file can be loaded in the meantime.
  for (;;) {
    const missing = [...files.values()]
      .flatMap((imports) => [...imports])
      .find((module) => !next.modules.has(module));
    if (!missing) break;
    await load(next, missing);
  }
  replace(next);
}

/** What a node holds that can be a component: an element, with its children. */
function* elementTypes(node: unknown, depth = 0): Generator<object> {
  if (!isObject(node) || depth > 50) return;
  if (Array.isArray(node)) {
    for (const child of node) yield* elementTypes(child, depth + 1);
    return;
  }
  if (!("$$typeof" in node) || !("props" in node) || !("type" in node)) return;
  if (isObject(node.type)) yield node.type;
  if (!isObject(node.props)) return;
  for (const value of Object.values(node.props)) yield* elementTypes(value, depth + 1);
}

/**
 * Throws for a node that was made while a page is open, with a component of
 * that page: the node is for the next page, which has a module graph of its
 * own, and a component of this one cannot render there.
 */
export function assertForNextPage(node: unknown): void {
  const graph = current;
  if (!graph?.taken) return;
  for (const type of elementTypes(node)) {
    if (!graph.exported.has(type)) continue;
    const name =
      (type as { displayName?: string; name?: string }).displayName ??
      (type as { name?: string }).name;
    throw new Error(
      `vitest-plugin-rsc: the node has a component of the page that is open` +
        `${name ? `, ${name}` : ""}. Every page has a module graph of its own, and a ` +
        `component that a "use client" file imports is of the page that is there when the ` +
        `node is made. Leave the page first, with \`await unmount()\` or \`await cleanup()\`, ` +
        `and make the node after that.`,
    );
  }
}
