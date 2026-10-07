// Where the three layers, three module graphs in one tab, reach each other.
// Each graph has its own copy of this module. They share the object.

export type ServerRequest = {
  url: string;
  method: string;
  headers: Headers;
  body?: ReadableStream<Uint8Array> | Uint8Array | null;
  signal?: AbortSignal;
};

/** The `handler` of an edge entry of Next: one route, as a function of a request. */
export type EdgeHandler = (
  request: ServerRequest,
  context: { waitUntil?: (promise: Promise<unknown>) => void; signal?: AbortSignal },
) => Promise<Response>;

type AnyFunction = (...args: any[]) => any;

export type NextRegistry = {
  /** A `Request` and `Response` that keep the headers a browser drops. */
  Request: typeof Request;
  Response: typeof Response;
  /** The server's `fetch`: its network, which is not the browser's. */
  fetch: typeof fetch;
  /** Starts the scope of one request, see `enterAmbientScope`. Returns its end. */
  enterRequestScope(): () => void;
  /** The rsc layer's Flight codec, behind the signatures Next calls. */
  flightServer: Record<string, AnyFunction>;
  flightStatic: Record<string, AnyFunction>;
  flightClient: Record<string, AnyFunction>;
  /** Loads the rsc-layer module of a route, into `appPages`. */
  loadAppPage(page: string): Promise<unknown>;
  appPages: Record<string, unknown>;
  /** Loads the edge entry of a route handler, which is in the rsc layer. */
  loadRouteHandler(page: string): Promise<EdgeHandler>;
  /** Whether an id names a Server Action of the app, in the rsc layer. */
  hasServerAction(id: string): Promise<boolean>;
  /** What a test renders in place of the page of a route, by page name. */
  pageOverrides: Record<string, unknown>;
  /** Loads a Client Component by its module id, in the ssr layer. */
  loadSsrModule(id: string): Promise<unknown>;
  /** `__webpack_require__` for the Flight client of the browser layer. */
  browserRequire(id: string): Promise<unknown>;
  loadBrowserModule(id: string): Promise<unknown>;
  ssr: { AppPageRouteModule: new (options: unknown) => unknown };
  /** Vite's client of the page, `/@vite/client`, for the layers a module runner loads. */
  viteClient: Record<string, unknown>;
};

const scope = globalThis as { __vitest_plugin_rsc_next__?: Partial<NextRegistry> };

export const registry = (scope.__vitest_plugin_rsc_next__ ??= {
  appPages: {},
  pageOverrides: {},
}) as NextRegistry;

/** The id of the module of a Server Action is the id of the action, marked. */
export const actionModulePrefix = "action:";
