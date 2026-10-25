import { registryGlobal } from "./registry-global.ts";
import type { Stylesheets } from "./styles-shared.ts";

// The three layers of the app are three module graphs with one `window`.
// Next's bundler config moves a few things across them: the route module is
// created for the rsc layer but belongs to the ssr layer, and the ssr layer
// renders the page of the rsc layer. Those cross here.
//
// Each graph has its own copy of this module. They share the object.

import type { SequentialAsyncLocalStorage } from "../async-local-storage.ts";
import type { ServerHttp } from "../page-host.ts";
import type { SpeedFeatures } from "./mode.ts";

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

/**
 * Which pathnames of a route `next build` prerenders, from its
 * `generateStaticParams`, before it renders one: see prerender-verdict.ts.
 */
export type PrerenderVerdict = {
  /** The pathnames the build prerenders. */
  pathnames: string[];
  /**
   * For a route with params: what Next does for a pathname not among them,
   * the `fallback` of its prerender manifest. `null` prerenders it at its
   * first request, `false` answers that it is not found.
   */
  fallback?: null | false;
};

/** See `NextRegistry.opened`. */
export type Opened = {
  pathname: string;
  /** Whether the server in front of the app takes the request: proxy.ts and `next.config`. */
  proxy: boolean;
  /**
   * With `files`: the files of the host that render the node, `hostFiles` of
   * `renderServer()`. With `version`: which render of it the server sends,
   * which `rerender()` counts up, and the page says it has committed. The
   * server reads both as it renders, after `rerender()` has set them.
   */
  node?: { ui: unknown; layouts: boolean; files: string[]; version?: number };
  /**
   * Whether Next renders the page a Server Action redirects to, into the
   * response of the action, as Next's router shows that page next. Not for
   * `runInServerAction()`, which shows no page. Read from `openedByRequest`.
   */
  rendersRedirect?: boolean;
  /**
   * `false`: Next renders no HTML of the page, see `RenderServerOptions.ssr`.
   * Read from `openedByRequest`.
   */
  ssr?: boolean;
};

/**
 * When a request of the page reached the server, started, was answered and
 * was done, by `performance.now()`: see `NextRegistry.requestTimings`.
 */
export type RequestTiming = {
  method: string;
  url: string;
  /**
   * Whether it is a Server Action, a request of Next's router for Flight, or
   * a page load: of a document, or of a page of the kept app by its Flight
   * payload, with `flightLoads`.
   */
  kind: "action" | "flight" | "page";
  queued: number;
  started?: number;
  answered?: number;
  finished?: number;
};

export type NextRegistry = {
  /** The speed features that are on, `mode` and the options of the features resolved: see speed-features.ts. */
  speedFeatures?: SpeedFeatures;
  /**
   * For a profile of a test run: set to an array, the server adds the timing
   * of each request of the page to it, in the order they reached it.
   */
  requestTimings?: RequestTiming[];
  /** A `Request` and `Response` that keep the headers a browser drops. */
  Request: typeof Request;
  Response: typeof Response;
  /** The `Headers` of those. */
  Headers: typeof Headers;
  /** The server's `fetch`: its network, which is not the browser's. */
  fetch: typeof fetch;
  /** The network itself: no request of it is the app's, and Next caches none. */
  network: typeof fetch;
  /** Those of the server's web APIs, whose streams take their signals. */
  AbortController: typeof AbortController;
  AbortSignal: typeof AbortSignal;
  /** Node's, for Next's server: a task after the microtasks. Not globals. */
  setImmediate(callback: (...args: any[]) => void, ...args: unknown[]): unknown;
  clearImmediate(id: unknown): void;
  /** The `setTimeout` and `clearTimeout` of server code: see globals.ts. */
  setTimeout(callback: unknown, delay?: number, ...args: unknown[]): unknown;
  clearTimeout(id: unknown): void;
  /** Starts the scope of one request, see `enterAmbientScope`. Returns its end. */
  enterRequestScope(): () => void;
  /** What an async function of server code is compiled to call: server-code.ts. */
  asyncFunctionHooks: object;
  /** The server's `queueMicrotask`: the callback has the stores of the code that queued it. */
  queueMicrotask(callback: () => void): void;
  /** Does a step of a render of React's Flight server, with the stores of its first step. */
  performWork(request: object, performWork: (request: object) => void): void;
  /** Changes when the caches are reset. A part of every key of a cache, see cache.ts. */
  cacheGeneration(): number;
  /** The rsc layer's Flight codec, behind the signatures Next calls. */
  flightServer: Record<string, AnyFunction>;
  flightStatic: Record<string, AnyFunction>;
  flightClient: Record<string, AnyFunction>;
  /** Loads the rsc-layer module of a route, into `appPages`. */
  loadAppPage(page: string): Promise<unknown>;
  appPages: Record<string, unknown>;
  /**
   * Asks the plugin for the stylesheets of a page route, by the name of its
   * modules, and for the route of a node with `files`, the files of the host
   * that render the node, `hostFiles` of `renderServer()`: see styles.ts.
   * The dev server answers; a static build reads them from a file of its
   * own (rsc.ts).
   */
  loadStylesheets(entry: string, inline: boolean, files: string[]): Promise<Stylesheets>;
  /**
   * Has the browser start the files of a page route at once, for a page load
   * that the plugin opens, by what `loadStylesheets()` takes: its modules and
   * its stylesheets (rsc.ts). They go with the page (document.ts), and none
   * come once `signal`, the request's, has aborted: the page is gone. Only a
   * static build has them: a dev server serves a module where it is asked for.
   * Resolves once they are in the document, before the route loads: Vite
   * preloads a module that is imported, for good, unless a link has it.
   */
  preloadRoute(entry: string, files: string[], signal: AbortSignal | undefined): Promise<void>;
  /**
   * Internal, not an API: the Vitest default behind `hostFiles` of
   * `renderServer()`, the files of the host that render a node when it is
   * not passed. The setup files and the test file, which the plugin's setup
   * file sets before every test file (setup.ts). Another host passes
   * `hostFiles`; without it a node has no stylesheets of the host's files.
   */
  nodeFiles?(): string[];
  /** The directory of the build on the server's disk, of this generation: see cache.ts. */
  buildDir(): string;
  /**
   * The directory of the server's own files, which the page's host has:
   * `""` in a browser, a temporary directory in Node.js (page-host.ts).
   */
  serverDir(): string;
  /**
   * The host's own `http`, on which Next's request handlers answer: Node's
   * in a worker of Node.js, none in a browser (page-host.ts, node-server.ts).
   */
  serverHttp: ServerHttp | undefined;
  /**
   * Next's build's verdict on a route of the app, by its page name and its
   * pathname, in the rsc layer: nothing for a route it renders at every
   * request.
   */
  prerenderVerdict(route: {
    kind: "page" | "route";
    page: string;
    pathname: string;
  }): Promise<PrerenderVerdict | undefined>;
  /** Whether an error is the one Next's handler of a route throws for a pathname it does not serve. */
  isNoFallbackError(error: unknown): boolean;
  /** Loads the request handler of a route handler, which is in the rsc layer. */
  loadRouteHandler(page: string): Promise<RequestHandler>;
  /** Loads the request handler of the middleware of the app, which is in the rsc layer. */
  loadMiddleware(): Promise<MiddlewareHandler>;
  /** Whether an id names a Server Action of the app, in the rsc layer. */
  hasServerAction(id: string): Promise<boolean>;
  /**
   * The id of the plugin's own Server Action, which every app here has: the
   * one of `runInServerAction()`, in the rsc layer.
   */
  ownServerAction?: Promise<string | undefined>;
  /** What the Server Action of `runInServerAction()` runs, by the number it is called with. */
  serverActions: Map<number, () => Promise<void>>;
  /**
   * What a request opened, for as long as it is handled: what it brings for
   * itself, like the route of a node of `runInServerAction()`, or else
   * `opened` at its URL (`openedAt()`). The page of the route of a node reads
   * it, and else `opened`. The server's `fetch` reads its `rendersRedirect`,
   * and Next's renderer its `ssr`.
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
  /** Loads a Client Component by its module id, in the ssr layer. */
  loadSsrModule(id: string): Promise<unknown>;
  /**
   * `__webpack_require__` for the Flight client of the browser layer: loads a
   * Client Component by its module id, in that layer. One for every page.
   */
  browserRequire(id: string): Promise<unknown>;
  /**
   * Loads a Client Component by its module id, in the browser layer: the
   * loader of the page that started last, until it is left.
   */
  loadBrowserModule?(id: string): Promise<unknown>;
  /**
   * Set while the browser layer gives the router of the kept app of `keepApp`
   * the state of its next page, which Next's patched router reads: see
   * `nextPatches` in compat/patches.ts.
   */
  replacingRouter?: boolean;
  /**
   * Next's route module for a page, loaded in the ssr layer, for the rsc
   * layer: its class, its renderer, and the contexts of its
   * `*.shared-runtime` modules.
   */
  ssr: {
    AppPageRouteModule: new (options: unknown) => unknown;
    vendored: Record<string, unknown>;
    renderToHTMLOrFlight: AnyFunction;
    prerenderToHTMLOrFlight: AnyFunction;
  };
  /** For Next's Node.js server: what stands in for the files of a build. */
  node: Record<string, AnyFunction>;
};

const scope = globalThis as { [registryGlobal]?: Partial<NextRegistry> };

export const registry = (scope[registryGlobal] ??= {
  appPages: {},
  serverActions: new Map(),
}) as NextRegistry;

/**
 * What the browser layer loads with no page to load it in: nothing, ever, as
 * the closed runner of a page that was left.
 */
export const loadsNothing = (): Promise<never> => new Promise(() => {});

/**
 * What `renderServer()` opened, at a URL that belongs to it: one with its
 * pathname. That is the document, and what the page sends there while it is
 * open: a Server Action, `router.refresh()`, a change of search params. A URL
 * with another pathname is the app's, as always. The server and the browser
 * layer both ask, so they agree on it.
 */
export function openedAt(url: URL): Opened | undefined {
  const { opened } = registry;
  return opened?.pathname === url.pathname ? opened : undefined;
}

/**
 * Next's build gives the module of a Server Action an id. Here the id of the
 * action already says where it is, so the module id is the action id, marked.
 */
export const actionModulePrefix = "action:";
