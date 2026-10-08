import { MockedResponse } from "next/dist/server/lib/mock-request";
import type { RequestMeta } from "next/dist/server/request-meta";
import { fromNodeOutgoingHttpHeaders, toNodeOutgoingHttpHeaders } from "next/dist/server/web/utils";
import {
  nextConfig,
  preview,
  routesManifest,
  routing,
} from "virtual:vitest-plugin-rsc/next-manifest";
import { Readable } from "virtual:vitest-plugin-rsc/node-stream";
import { restoreIncrementalCache } from "./cache.ts";
import { registry, type RequestHandler, type ServerRequest } from "./registry.ts";
import type { Stylesheets } from "./styles-command.ts";

// Next's server runs here as it does on Node.js, its default runtime. (Its
// edge runtime, which is closer to a browser, is deprecated.) The renderer
// takes the branches of `process.env.NEXT_RUNTIME === "nodejs"`, with web
// streams: `__NEXT_USE_NODE_STREAMS` is off. This file is what a Node.js server
// has around a request and a browser does not:
//   - `http.IncomingMessage` and `http.ServerResponse`.
//   - The manifests of a build, which Next reads from `.next/`: given here,
//     through `load-manifest.external`, the module Next keeps out of its own
//     bundle for it.
// The request handlers are Next's own, the ones its build makes for a page
// and for a route handler and `next start` calls: `handler(req, res, ctx)`.
// The Node modules that Next's server imports are in node-platform.ts, and
// its globals in globals.ts.

export const anyKey = <T>(create: (key: string) => T) =>
  new Proxy({} as Record<string, T>, {
    get: (_, key) => (typeof key === "string" ? create(key) : undefined),
    has: () => true,
  });

// Next's build lists the CSS files of every layout, page and boundary, by the
// file of the segment, and Next's renderer links them next to that segment.
// Here the plugin says which they are, for the routes that were requested:
// see styles.ts. The stylesheets of a file are the same in every route.
type CssFile = { path: string; inlined: false } | { path: string; inlined: true; content: string };
const stylesheets = new Map<string, CssFile[]>();
export function setStylesheets(of: Stylesheets): void {
  for (const [file, entries] of Object.entries(of)) {
    stylesheets.set(
      file,
      entries.map(({ path, content }) =>
        content === undefined ? { path, inlined: false } : { path, inlined: true, content },
      ),
    );
  }
}

// Next's build writes a manifest of every client reference. For Vite RSC a
// reference is its module id, so this one answers for any id.
const clientReference = anyKey((id) => anyKey((name) => ({ id, name, chunks: [], async: true })));
const clientReferenceManifest = {
  moduleLoading: { prefix: "", crossOrigin: null },
  clientModules: anyKey((id) => ({ id, name: "*", chunks: [], async: true })),
  ssrModuleMapping: clientReference,
  rscModuleMapping: clientReference,
  entryCSSFiles: anyKey((file) => stylesheets.get(file) ?? []),
  entryJSFiles: anyKey(() => []),
};

const buildManifest = {
  polyfillFiles: [],
  // Next requires a script that starts the app and puts it in the HTML.
  // Nothing loads it: `renderServer()` starts the app.
  rootMainFiles: ["static/chunks/main-app.js"],
  devFiles: [],
  lowPriorityFiles: [],
  pages: {},
};

// The files of `.next/` that the route module of a page reads, by the end of
// their path. What is not here is a file a build does not always write.
const manifests: [suffix: string, manifest: () => unknown][] = [
  // The one Next's build makes: see `routesManifest` in project.ts.
  ["routes-manifest.json", () => routesManifest],
  [
    "prerender-manifest.json",
    () => ({ version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview }),
  ],
  ["preview-props.json", () => preview],
  ["fallback-build-manifest.json", () => ({})],
  ["build-manifest.json", () => buildManifest],
  [
    "next-font-manifest.json",
    () => ({ pages: {}, app: {}, appUsingSizeAdjust: false, pagesUsingSizeAdjust: false }),
  ],
  [
    "_client-reference-manifest.js",
    () => ({ __RSC_MANIFEST: anyKey(() => clientReferenceManifest) }),
  ],
  [
    "server-reference-manifest.json",
    () => ({ node: serverActions, edge: serverActions, encryptionKey: "" }),
  ],
  ["required-server-files.json", () => ({ config: nextConfig })],
  ["BUILD_ID", () => routing.buildId],
];

function loadManifest(file: string): unknown {
  return manifests.find(([suffix]) => file.endsWith(suffix))?.[1]();
}

registry.node = {
  loadManifest,
  evalManifest: loadManifest,
  loadManifestFromRelativePath: ({ manifest }: { manifest: string }) => loadManifest(manifest),
  evalManifestFromRelativePath: ({ manifest }: { manifest: string }) => loadManifest(manifest),
};

// A test's own timers may be fake.
const nativeSetTimeout = globalThis.setTimeout;

const leftBeforeSent = () =>
  new DOMException("The page was left before the server had sent it.", "AbortError");
const pending = new Promise<never>(() => {});

/** The `http.IncomingMessage` of a request: a stream of its body, with what Next reads of it. */
function createNodeRequest(request: ServerRequest) {
  const url = new URL(request.url);
  const { body } = request;
  const stream =
    body instanceof Uint8Array ? Readable.from([body]) : body && Readable.fromWeb(body as never);
  return Object.assign(stream || Readable.from([]), {
    method: request.method,
    url: url.pathname + url.search,
    headers: { host: url.host, ...toNodeOutgoingHttpHeaders(request.headers) },
    httpVersion: "1.1",
    socket: { encrypted: url.protocol === "https:" },
  });
}

/**
 * The `http.ServerResponse` of a request, which is Next's own stand-in for
 * one, and the `Response` the browser gets of it: once its head is there, while
 * Next goes on to write the body.
 *
 * A request that is left before its head has no response. It lasts until
 * Next's handler is done with it, which can be much later, when the data it
 * waited for comes: its stores have to be there until then.
 */
function createNodeResponse(request: ServerRequest) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let headSent = false;
  let wrote = false;
  let finished = false;
  let cancelled = false;
  let sendHead!: () => void;
  // Resolves when the status and the headers are final: at the first byte.
  const head = new Promise<void>((resolve) => (sendHead = resolve)).then(() => (headSent = true));
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start: (c) => void (controller = c),
    // Whoever reads the response has left, like a browser that leaves a page.
    cancel() {
      cancelled = true;
      res.destroy();
    },
  });

  const res = new MockedResponse({
    resWriter(chunk: string | Uint8Array) {
      if (res.destroyed) return false;
      sendHead();
      // As Node says once the first byte is out. Next asks, where it fails.
      wrote = headSent = res.headersSent = true;
      controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : new Uint8Array(chunk));
      return true;
    },
  });
  res.on("finish", () => {
    finished = headSent = true;
    // Node's stream says so itself; the older one of the polyfill does not.
    // Next takes a `close` without it for a client that left, and aborts
    // the signal of the request.
    Object.defineProperty(res, "writableFinished", { value: true, configurable: true });
    sendHead();
    controller.close();
    // A socket closes after the response has gone out: what Next runs then,
    // like `after()`, comes after whoever asked has its answer.
    nativeSetTimeout(() => res.destroy());
  });
  // Closed before all of it went out: by an error, or because whoever asked
  // has left. A reader that cancelled the body has ended it already.
  let failure: unknown;
  res.on("error", (error) => (failure ??= error));
  res.on("close", () => {
    if (headSent && !finished && !cancelled) controller.error(failure ?? leftBeforeSent());
  });
  // Next's stand-in rejects this for a response that ends with an error.
  // Nobody waits for it here: the body ends with the error.
  (res as unknown as { hasStreamed: Promise<unknown> }).hasStreamed.catch(() => {});
  request.signal?.addEventListener("abort", () => res.destroy(), { once: true });

  const response = (written: Promise<unknown>): Promise<Response> => {
    const settled = written.then(
      // Without a head: Next ended the response with an error before its
      // first byte, or whoever asked has left.
      () => (headSent ? pending : Promise.reject(failure ?? leftBeforeSent())),
      (error) => {
        // What fails before the head is the failure of the request. After
        // it, the body ends with the error.
        if (!headSent) throw error;
        res.destroy(error ?? new Error("The request handler failed."));
        return pending;
      },
    );
    const sent = head.then(() => {
      // A status without a body, and an `end()` without a byte before it.
      const empty = (finished && !wrote) || [101, 204, 205, 304].includes(res.statusCode);
      return new registry.Response(empty ? null : body, {
        status: res.statusCode,
        statusText: res.statusMessage,
        headers: fromNodeOutgoingHttpHeaders(res.getHeaders()),
      });
    });
    return Promise.race([sent, settled]);
  };
  return { res, response };
}

/**
 * What the server in front of a route knows of a request that it routed: see
 * `handle()` in ssr.ts.
 */
export type RoutedRequestMeta = Pick<RequestMeta, "params" | "query">;

// What `next start` knows of a request before a route gets it: the URL the
// browser asked for, and what it made of that URL. Without the first Next
// takes the server to be `localhost`.
function requestMetaOf(request: ServerRequest, routed: RoutedRequestMeta = {}) {
  return {
    ...(routed.params && { params: routed.params }),
    ...(routed.query && { query: routed.query }),
    initURL: request.url,
    initProtocol: new URL(request.url).protocol.slice(0, -1),
  };
}

// Next's build lists the Server Actions of the app in a manifest. Here the
// server lists the one a request calls, for that request: see ssr.ts.
let serverActions: object = {};
export function setServerActions(actions: object): void {
  serverActions = actions;
}

/**
 * One request, by the request handler Next's build makes for its route:
 * `templates/app-page-runtime` for a page and `templates/app-route` for a
 * route handler, as `next start` calls them.
 */
export async function handleRequest(
  request: ServerRequest,
  context: { waitUntil?: (promise: Promise<unknown>) => void },
  handler: RequestHandler,
  routed?: RoutedRequestMeta,
  { statusCode, headers }: { statusCode?: number; headers?: Headers } = {},
): Promise<Response> {
  const { res, response } = createNodeResponse(request);
  // The status and the headers the server in front of the route has for the
  // response, which `next start` sets the same way: `res.statusCode = 404`,
  // `res.setHeader()`. The handler reads them, and can set others, or add to
  // them, like React's `Link` of the stylesheets of a page. Not the cookies,
  // which a route can set over: see `finishWithBody()` in ssr.ts.
  if (statusCode !== undefined) res.statusCode = statusCode;
  headers?.forEach((value, name) => {
    if (name !== "set-cookie") res.setHeader(name, value);
  });
  // Next's route module makes a cache of its own for every request, and
  // leaves it in the global of the server's: see cache.ts.
  const handled = handler(createNodeRequest(request), res, {
    waitUntil: context.waitUntil,
    requestMeta: {
      ...requestMetaOf(request, routed),
      incrementalCache: globalThis.__incrementalCache,
    },
  }).finally(restoreIncrementalCache);
  return response(handled);
}
