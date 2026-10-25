import { Readable } from "vitest-plugin-rsc/node/stream";
import { restoreIncrementalCache } from "./cache.ts";
import {
  fromNodeOutgoingHttpHeaders,
  isDynamicServerError,
  MockedResponse,
  toNodeOutgoingHttpHeaders,
  type RequestMeta,
} from "./compat/ssr/node-server.ts";
import type { Served, ServerHttp, Writing } from "../page-host.ts";
import { registry, type RequestHandler, type ServerRequest } from "./registry.ts";

// Next's server runs here as it does on Node.js, its default runtime. (Its
// edge runtime, which is closer to a browser, is deprecated.) The renderer
// takes the branches of `process.env.NEXT_RUNTIME === "nodejs"`, with web
// streams: `__NEXT_USE_NODE_STREAMS` is off. This file and build-output.ts are
// what a Node.js server has around a request and a browser does not:
//   - `http.IncomingMessage` and `http.ServerResponse`: in a worker of
//     Node.js Node's own, the host's (`serverHttp` of page-host.ts); in a
//     browser here, Next's stand-in of a response, with the body the browser
//     reads of it, when it is written and how it stops.
//   - The files of a build, which Next reads from `.next/`: build-output.ts.
// The request handlers are Next's own, the ones its build makes for a page
// and for a route handler and `next start` calls: `handler(req, res, ctx)`.
// The modules of Node.js that Next's server imports are the package's
// (node-builtins.ts), Next's own modules of its process are in
// node-platform.ts, and its globals in globals.ts.

// A test's own timers may be fake.
const nativeSetTimeout = globalThis.setTimeout;

const leftBeforeSent = () =>
  new DOMException("The page was left before the server had sent it.", "AbortError");

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

const writings = new WeakMap<Response, Writing>();
/** How the body of a response of `handleRequest()` is written, if it has one. */
export const writingOf = (response: Response): Writing | undefined => writings.get(response);

/**
 * The `http` of a browser, which has none: Next's own stand-in for an
 * `http.ServerResponse`, and the `Response` the browser gets of it, once its
 * head is there, while Next goes on to write the body.
 *
 * A request that is left before its head has no response. It lasts until
 * Next's handler is done with it, which can be much later, when the data it
 * waited for comes: its stores have to be there until then.
 */
const standInHttp: ServerHttp = (request, respond) => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let headSent = false;
  let wrote = false;
  let finished = false;
  let cancelled = false;
  let sendHead!: () => void;
  // Resolves when the status and the headers are final: at the first byte.
  const head = new Promise<void>((resolve) => (sendHead = resolve)).then(() => (headSent = true));
  const encoder = new TextEncoder();
  let ended!: () => void;
  const bodyWritten = new Promise<void>((resolve) => (ended = resolve));
  const body = new ReadableStream<Uint8Array>({
    start: (c) => void (controller = c),
    // Whoever reads the response has left, like a browser that leaves a page.
    cancel() {
      cancelled = true;
      res.destroy();
      ended();
    },
  });
  // The render ends as an abort, which is what a browser that leaves a page
  // is to a server: Next does not report it as an error of the app.
  const stop = () => {
    cancelled = true;
    controller.error(AbortSignal.abort().reason);
    res.destroy();
    ended();
  };

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
  // Next's handler of a page that it prerenders at the request appends the
  // `location` it set as it rendered once more, from what it keeps. Node
  // sends the two lines, which a browser takes for one; Next's stand-in
  // joins them into one value.
  const appendHeader = res.appendHeader.bind(res);
  res.appendHeader = (name: string, value: string | string[]) =>
    name.toLowerCase() === "location" && res.getHeader(name) === value
      ? res
      : appendHeader(name, value);
  // A `Writable` of Node.js 14+ destroys itself as it finishes, and so does
  // the package's stream: not this one, which closes on the timer below.
  (res as unknown as { _writableState: { autoDestroy: boolean } })._writableState.autoDestroy =
    false;
  res.on("finish", () => {
    finished = headSent = true;
    // Node's stream says so itself; the older one of the polyfill does not.
    // Next takes a `close` without it for a client that left, and aborts
    // the signal of the request.
    Object.defineProperty(res, "writableFinished", { value: true, configurable: true });
    sendHead();
    controller.close();
    ended();
    // A socket closes after the response has gone out: what Next runs then,
    // like `after()`, comes after whoever asked has its answer.
    nativeSetTimeout(() => res.destroy());
  });
  // Closed before all of it went out: by an error, or because whoever asked
  // has left. A reader that cancelled the body has ended it already.
  let failure: unknown;
  res.on("error", (error) => (failure ??= error));
  res.on("close", () => {
    if (!headSent || finished || cancelled) return;
    controller.error(failure ?? leftBeforeSent());
    ended();
  });
  // Next's stand-in rejects this for a response that ends with an error.
  // Nobody waits for it here: the body ends with the error.
  (res as unknown as { hasStreamed: Promise<unknown> }).hasStreamed.catch(() => {});
  // Whoever asked can leave until the response closes, and no longer: the
  // signal can outlive the request, like the one of a page.
  const { signal } = request;
  const leave = () => res.destroy();
  signal?.addEventListener("abort", leave, { once: true });
  res.once("close", () => signal?.removeEventListener("abort", leave));

  const sent = head.then((): Served => {
    // A status without a body, and an `end()` without a byte before it.
    const empty = (finished && !wrote) || [101, 204, 205, 304].includes(res.statusCode);
    const response = new registry.Response(empty ? null : body, {
      status: res.statusCode,
      statusText: res.statusMessage,
      headers: fromNodeOutgoingHttpHeaders(res.getHeaders()),
    });
    return { response, writing: empty ? undefined : { written: bodyWritten, stop } };
  });
  // Next's handler is done with the request, often long after the head.
  // With a head, the answer is the response of that head. Without one,
  // the response is over, and closes as a socket would.
  const settled = respond(createNodeRequest(request), res).then(
    // Without a head: Next ended the response with an error before its
    // first byte, or whoever asked has left.
    () => {
      if (headSent) return sent;
      res.destroy();
      throw failure ?? leftBeforeSent();
    },
    (error) => {
      // What fails before the head is the failure of the request. After
      // it, the body ends with the error.
      if (!headSent) {
        res.destroy();
        throw error;
      }
      res.destroy(error ?? new Error("The request handler failed."));
      return sent;
    },
  );
  return Promise.race([sent, settled]);
};

// What Next's handler throws as it prerenders a route that the build's
// verdict on its config marked as prerendered, and that read the request: a
// page, after its render (`build/templates/app-page-runtime.js:682-690`),
// and a route handler, from `prerender()`. A build finds it as it
// prerenders, and keeps the route dynamic. `handle()` in ssr.ts does that.
const staticToDynamic = "Page changed from static to dynamic at runtime ";
export const isPrerenderBailout = (error: unknown): boolean =>
  isDynamicServerError(error) ||
  (error instanceof Error && error.message.startsWith(staticToDynamic));

// What `next start` hands Next's route modules of the server around them
// (`server/lib/router-server.js:651-663`), by the directory of the project,
// which is the working directory here: the logger of the errors of a request.
// Without the bail-outs of a prerender, which the server handles, and counts
// for the prerender that runs: the last one started, as a request the server
// makes to itself runs inside the one that made it.
const prerenders: { bailouts: number }[] = [];
const routerServerContexts = Symbol.for("@next/router-server-methods");
(globalThis as { [routerServerContexts]?: object })[routerServerContexts] = {
  "": {
    logErrorWithOriginalStack(error: unknown) {
      const prerender = prerenders.at(-1);
      if (!isPrerenderBailout(error)) console.error(error);
      else if (prerender) prerender.bailouts++;
    },
  },
};
/**
 * Counts the bail-outs that Next's handler reports for the prerender that
 * starts now: also those it answers with its error page itself, where its
 * render of a page recovers from the error (`app-page-runtime.js:1133-1224`).
 * The function it returns ends the count and answers it, once: a count that
 * stays would get the bail-outs of the prerenders after it.
 */
export function countBailouts(): () => number {
  const prerender = { bailouts: 0 };
  prerenders.push(prerender);
  return () => {
    const at = prerenders.lastIndexOf(prerender);
    if (at !== -1) prerenders.splice(at, 1);
    return prerender.bailouts;
  };
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
  // Next's route module makes a cache of its own for every request, and
  // leaves it in the global of the server's: see cache.ts.
  const requestMeta = {
    ...requestMetaOf(request, routed),
    incrementalCache: globalThis.__incrementalCache,
  };
  const respond = (req: unknown, res: unknown) => {
    const response = res as OutgoingHead;
    // The status and the headers the server in front of the route has for
    // the response, which `next start` sets the same way: `res.statusCode =
    // 404`, `res.setHeader()`. The handler reads them, and can set others, or
    // add to them, like React's `Link` of the stylesheets of a page. Not the
    // cookies, which a route can set over: see `finishWithBody()` in ssr.ts.
    if (statusCode !== undefined) response.statusCode = statusCode;
    headers?.forEach((value, name) => {
      if (name !== "set-cookie") response.setHeader(name, value);
    });
    return handler(req, res, { waitUntil: context.waitUntil, requestMeta }).finally(
      restoreIncrementalCache,
    );
  };
  // The host's own `http`, or, in a browser, the stand-in.
  const { response, writing } = await (registry.serverHttp ?? standInHttp)(request, respond);
  if (writing) writings.set(response, writing);
  return response;
}

/** What `handleRequest()` sets of an `http.ServerResponse` before Next's handler has it. */
type OutgoingHead = { statusCode: number; setHeader(name: string, value: string): void };
