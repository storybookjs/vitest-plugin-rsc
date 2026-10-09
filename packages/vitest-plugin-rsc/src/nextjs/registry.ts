import type { Stylesheets } from "./styles-shared.ts";

// The three layers of the app are three module graphs with one `window`.
// Next's bundler config moves a few things across them: the route module is
// created for the rsc layer but belongs to the ssr layer, and the ssr layer
// renders the page of the rsc layer. Those cross here.
//
// Each graph has its own copy of this module. They share the object.

import type { SequentialAsyncLocalStorage } from "../async-local-storage.ts";

export type ServerRequest = {
  url: string;
  method: string;
  headers: Headers;
  body?: ReadableStream<Uint8Array> | Uint8Array | null;
  signal?: AbortSignal;
};

/**
 * The request handler Next's build makes for a route, for Node.js: it takes
 * an `http.IncomingMessage` and writes to an `http.ServerResponse`.
 */
export type RequestHandler = (
  req: unknown,
  res: unknown,
  context: { waitUntil?: (promise: Promise<unknown>) => void; requestMeta?: object },
) => Promise<unknown>;

/**
 * The request handler Next's build makes for the middleware of an app, its
 * `proxy.ts`: it takes a `Request` and answers with a `Response`, on Node.js
 * too.
 */
export type MiddlewareHandler = (
  request: ServerRequest,
  context: { waitUntil?: (promise: Promise<unknown>) => void; signal?: AbortSignal },
) => Promise<Response>;

type AnyFunction = (...args: any[]) => any;

/** Where an export of a file of the host that is code of the browser layer is from. */
export type ClientExport = {
  /** The module the browser layer imports the file by. */
  module: string;
  /** The name of the export. */
  name: string;
  /**
   * One object for each time the rsc layer evaluated the file: another one
   * is the file as it is after a change.
   */
  load: object;
};

/** See `NextRegistry.nodeReporter`. */
export type NodeReporter = {
  shown(shown: boolean): void;
  rendered(version: number): void;
};

/** See `NextRegistry.opened`. */
export type Opened = {
  pathname: string;
  /** Whether the server in front of the app takes the request: proxy.ts and `next.config`. */
  proxy: boolean;
  node?: {
    ui: unknown;
    layouts: boolean;
    /**
     * For a node of the server: which render of it the server sends, which
     * `rerender()` counts up. The page says when it has committed it: see
     * `NodeRendered` in client-node.tsx. A node of the browser layer renders
     * again in the browser, and has none.
     */
    version?: number;
    /** The files of the host that render the node, as `NextRegistry.nodeFiles()` said. */
    files?: string[];
  };
};

/**
 * A node of the browser layer: what a test or a story with `"use client"`
 * renders. It is not sent through Flight. The server renders a page with one
 * Client Component, client-node.tsx, and that one renders this, which it
 * finds here. So a prop can be anything, also a function.
 */
export type ClientNode = (
  | {
      /** A node the test made, with the modules of the page: see client-graph.ts. */
      ui: unknown;
    }
  | {
      /** What the browser layer imports the module by. */
      module: string;
      /** The export of it to render. */
      name: string;
      /** The props of that export, as they are. */
      props: Record<string, unknown>;
    }
) & {
  /** A component around it, which gets it as its children. */
  wrapper?: unknown;
  /** Called once the page has rendered the node, or has failed to. */
  rendered?: () => void;
};

export type NextRegistry = {
  /** A `Request` and `Response` that keep the headers a browser drops. */
  Request: typeof Request;
  Response: typeof Response;
  /** The server's `fetch`: its network, which is not the browser's. */
  fetch: typeof fetch;
  /** The network itself: no request of it is the app's, and Next caches none. */
  network: typeof fetch;
  /** Node's, for Next's server: a task after the microtasks. Not globals. */
  setImmediate(callback: (...args: any[]) => void, ...args: unknown[]): unknown;
  clearImmediate(id: unknown): void;
  /** Starts the scope of one request, see `enterAmbientScope`. Returns its end. */
  enterRequestScope(): () => void;
  /** The rsc layer's Flight codec, behind the signatures Next calls. */
  flightServer: Record<string, AnyFunction>;
  flightStatic: Record<string, AnyFunction>;
  flightClient: Record<string, AnyFunction>;
  /** Loads the rsc-layer module of a route, into `appPages`. */
  loadAppPage(page: string): Promise<unknown>;
  appPages: Record<string, unknown>;
  /**
   * Asks the plugin for the stylesheets of a page route, by the name of its
   * modules: see styles.ts. From the dev server, or the files of a static
   * build (rsc.ts). For the route of a node, `files` are the files of the
   * host that render it: see `nodeFiles()`.
   */
  loadStylesheets(entry: string, inline: boolean, files?: string[]): Promise<Stylesheets>;
  /**
   * The files of the host that render the node `renderServer()` opens, which
   * the host says, the outer ones first: under Vitest the setup files and the
   * test file that runs (setup.ts), under Storybook `.storybook/preview` and
   * the story file. Each is a path from the root of the project, like
   * `./stories/button.stories.tsx`, or an absolute one, which a static build
   * does not know. The node has the stylesheets of what they import, in that
   * order. Without it, those of every file of the host.
   */
  nodeFiles?(): string[] | undefined;
  /** Loads the request handler of a route handler, which is in the rsc layer. */
  loadRouteHandler(page: string): Promise<RequestHandler>;
  /** Loads the request handler of the middleware of the app, which is in the rsc layer. */
  loadMiddleware(): Promise<MiddlewareHandler>;
  /** Whether an id names a Server Action of the app, in the rsc layer. */
  hasServerAction(id: string): Promise<boolean>;
  /** What the Server Action of `runInServerAction()` runs, by the number it is called with. */
  serverActions: Map<number, () => Promise<void>>;
  /**
   * The route of a node that a request brings for itself, like the one of
   * `runInServerAction()`, for as long as it is handled. The page of the route of
   * a node reads it, and else `opened`.
   */
  openedByRequest: SequentialAsyncLocalStorage<Opened | undefined>;
  /**
   * What `renderServer()` opened, for as long as it is open: the pathname of
   * its URL, and how the server takes a request to that pathname. Without
   * `proxy` it goes straight to the app's route for it. With a `node`, that
   * pathname is the node's route, or with `layouts` the app's route with the
   * node as its page.
   */
  opened: Opened | undefined;
  /** The node of the browser layer that the page has, and who to tell when it changes. */
  clientNode: ClientNode | undefined;
  clientNodeListeners: Set<() => void>;
  /**
   * Who to tell what the page that is open does with the node of the test,
   * for `rerender()`: that the node is on the page or has left it, and which
   * render of a node of the server it has committed. A page asks once, so
   * that a page that was left tells nobody.
   */
  nodeReporter?(): NodeReporter | undefined;
  /**
   * Where an export of a test file or a story file with `"use client"` is
   * from, or the stand-in for an export of a file of `host.ui.files`.
   */
  clientExports: WeakMap<object, ClientExport>;
  /** Loads a Client Component by its module id, in the ssr layer. */
  loadSsrModule(id: string): Promise<unknown>;
  /**
   * `__webpack_require__` for the Flight client of the browser layer: loads a
   * Client Component by its module id, in that layer. One for every page.
   */
  browserRequire(id: string): Promise<unknown>;
  loadBrowserModule(id: string): Promise<unknown>;
  ssr: { AppPageRouteModule: new (options: unknown) => unknown };
  /** For Next's Node.js server: what stands in for the files of a build. */
  node: Record<string, AnyFunction>;
  /**
   * Told what the server loads without an import of the test: a page or a
   * route handler, by its entry, or the module of a Server Action. Only there
   * with the `affectedTests` option: see affected/browser.ts.
   */
  reportLoaded?(kind: "page" | "route" | "action", id: string): void;
};

const scope = globalThis as { __vitest_plugin_rsc_next__?: Partial<NextRegistry> };

export const registry = (scope.__vitest_plugin_rsc_next__ ??= {
  appPages: {},
  clientNodeListeners: new Set(),
  clientExports: new WeakMap(),
  serverActions: new Map(),
}) as NextRegistry;

/** Sets the node of the browser layer, and has the page render it. */
export function setClientNode(node: ClientNode | undefined): void {
  registry.clientNode = node;
  for (const changed of registry.clientNodeListeners) changed();
}

/**
 * Next's build gives the module of a Server Action an id. Here the id of the
 * action already says where it is, so the module id is the action id, marked.
 */
export const actionModulePrefix = "action:";
