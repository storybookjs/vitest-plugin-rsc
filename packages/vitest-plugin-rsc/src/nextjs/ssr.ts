import {
  NEXT_REWRITTEN_PATH_HEADER,
  NEXT_REWRITTEN_QUERY_HEADER,
  NEXT_RSC_UNION_QUERY,
  RSC_HEADER,
} from "next/dist/client/components/app-router-headers";
import { isRSCRequestHeader } from "next/dist/server/lib/is-rsc-request";
import * as appPageModule from "next/dist/server/route-modules/app-page/module";
import { normalizeNextQueryParam } from "next/dist/server/web/utils";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex";
import { routes as allRoutes, routing } from "virtual:vitest-plugin-rsc/next-manifest";
import { actionIdsOf } from "./action-ids.ts";
import { loadCacheHandlers, shareIncrementalCache } from "./cache.ts";
import { registerModuleLoader } from "./client-modules.ts";
import {
  anyKey,
  handleRequest as handleWith,
  setServerActions,
  setStylesheets,
} from "./node-server.ts";
import {
  actionModulePrefix,
  openedAt,
  registry,
  type Opened,
  type RequestHandler,
  type ServerRequest,
} from "./registry.ts";
import {
  incoming,
  middlewareResult,
  redirectStatus,
  resolve,
  type InvokeMiddleware,
} from "./server-in-front.ts";

export { resetCaches } from "./cache.ts";

// The ssr layer: Next's request handler and HTML renderer. node-server.ts is
// what Next's Node.js server has around them, and a browser does not.

registry.ssr = {
  AppPageRouteModule: appPageModule.AppPageRouteModule as never,
  vendored: appPageModule.vendored,
};
registerModuleLoader("ssr");

// The routes of the app by their page name, and the route of a node for each
// of their pathnames: see `handle()`.
const routes = new Map(
  allRoutes.filter((route) => !route.component).map((route) => [route.page, route]),
);
const componentRoutes = new Map(
  allRoutes
    .filter((route) => route.component && !route.layouts)
    .map((route) => [route.pathname, route]),
);
// And the route of a node with the layouts of a page, by the name of that page.
const componentLayoutRoutes = new Map(
  allRoutes.filter((route) => route.layouts).map((route) => [route.page, route]),
);

const notFoundPage = "/_not-found/page";

type Query = Record<string, string | string[]>;

// The query of a URL as the app has it. Without the params of the route,
// which are in the query that the resolution ends with, under the names Next
// gives them for a server in front of its own, like `nxtPid`.
function appQuery(query: Iterable<[string, string | string[]]>): Query {
  // Without a prototype, as the query Node.js parses: a key can be `constructor`.
  const result: Query = Object.create(null);
  for (const [name, value] of query) {
    if (normalizeNextQueryParam(name) !== null) continue;
    result[name] = name in result ? [result[name]!, value].flat() : value;
  }
  return result;
}

// A query as text, to tell whether two are the same. Without what Next's
// router adds to a request of its own.
function searchOf(query: Query): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (name === NEXT_RSC_UNION_QUERY) continue;
    for (const item of [value].flat()) search.append(name, item);
  }
  return search.toString();
}

// The params of a dynamic route, read off a pathname with Next's own matcher
// for the route: what `next start` hands its request handler too. In any
// letter case, which is how the resolution finds a route.
const paramMatchers = new Map<string, ReturnType<typeof getRouteMatcher>>();
function paramsOf(route: string, pathname: string) {
  let match = paramMatchers.get(route);
  if (!match) {
    const { re, groups } = getRouteRegex(route);
    match = getRouteMatcher({ re: new RegExp(re.source, "i"), groups });
    paramMatchers.set(route, match);
  }
  try {
    return match(pathname) || undefined;
  } catch {
    // A pathname that does not decode, which Next's handler fails on too.
    return undefined;
  }
}

// A pathname of the app as Next's router has it: without the base path.
function withoutBasePath(pathname: string): string {
  const { basePath } = routing;
  return basePath && pathname.startsWith(basePath)
    ? pathname.slice(basePath.length) || "/"
    : pathname;
}

// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
const now = performance.now.bind(performance);

// One request at a time: see `enterAmbientScope`.
let queue: Promise<unknown> = Promise.resolve();
// The requests that wait for the one the server is handling, and a promise
// that resolves once there is one: see `endRequest` in `handle()`.
let queued = 0;
let requestQueued = Promise.withResolvers<void>();
const nextRequest = () => (queued > 0 ? Promise.resolve() : requestQueued.promise);
// How to stop the renders whose response is still being written.
const rendering = new Set<() => void>();
// Changes when the test moves on, for the requests that were still waiting.
let generation = 0;
const backgroundWorkTimeout = 1000;
// What the server does after its responses, like `after()`, until it is done.
const backgroundWork = new Set<Promise<unknown>>();
// The requests that the server has not answered yet, each with what to call
// it in a warning: see `settleRequests()`.
const unanswered = new Map<Promise<unknown>, string>();
// How long leaving a page waits for those requests and for that work, at
// most. Only what never ends takes that long: see `settleRequests()`.
const settleTimeout = 5000;

export type HandleOptions = {
  /**
   * For a request the server makes to itself while it handles one, which
   * cannot wait for that one to finish.
   */
  nested?: boolean;
  /**
   * What a request gets that the server has nothing for: no route, and no
   * redirect or rewrite, after the middleware has let it through. The
   * not-found page of the app, or with `"pass"` no response: a deployment
   * looks for a file then, which here is the network's to answer.
   */
  unrouted?: "not-found" | "pass";
  /**
   * What the request opens, in place of what `renderServer()` opened: the
   * route of a node of its own, for this request only, or with `null`
   * nothing.
   */
  opened?: Opened | null;
  /**
   * Whether the request loads a page into the document, which starts the
   * files of its route as the server renders it: see `preloadRoute()` of the
   * registry.
   */
  pageLoad?: boolean;
};

// What `handle()` makes of a request, and when the server is done with it.
type Handled = { response?: Response; finished: Promise<void> };

/** The Next.js server of this app. Without a response only with `unrouted: "pass"`. */
export function handleRequest(
  request: ServerRequest,
  options?: HandleOptions & { unrouted?: "not-found" },
): Promise<Response>;
export function handleRequest(
  request: ServerRequest,
  options: HandleOptions,
): Promise<Response | undefined>;
export function handleRequest(
  request: ServerRequest,
  { nested = false, unrouted = "not-found", opened, pageLoad = false }: HandleOptions = {},
): Promise<Response | undefined> {
  if (nested) {
    return untilAnswered(request, handle(request, unrouted, true, opened, pageLoad)).then(
      ({ response }) => response,
    );
  }
  const requested = generation;
  queued++;
  requestQueued.resolve();
  const result = queue.then(() => {
    // `settleRequests()` has forgotten the ones that waited before it.
    if (requested !== generation) {
      throw new DOMException("The page was left before the server responded.", "AbortError");
    }
    queued--;
    requestQueued = Promise.withResolvers();
    return untilAnswered(request, handle(request, unrouted, false, opened, pageLoad));
  });
  // The next request waits for the body too: the server writes it as it
  // renders, long after the response is there.
  queue = result.then(
    ({ finished }) => finished,
    () => {},
  );
  return result.then(({ response }) => response);
}

// Keeps a request in `unanswered` until the server has answered it.
function untilAnswered(request: ServerRequest, handled: Promise<Handled>): Promise<Handled> {
  const settled = handled.then(
    () => {},
    () => {},
  );
  unanswered.set(settled, `${request.method} ${new URL(request.url).pathname}`);
  void settled.then(() => unanswered.delete(settled));
  return handled;
}

// Ends the responses that the server is writing: a short wait, then a stop.
async function stopResponses(written: Promise<unknown>): Promise<void> {
  await Promise.race([written, new Promise((resolve) => setTimeout(resolve, 100))]);
  for (const stop of rendering) stop();
  rendering.clear();
}

// Waits until `work` is empty, also for what is added while it waits. Not
// past the deadline: then it says so.
async function untilDone(work: () => Iterable<Promise<unknown>>, deadline: number) {
  let done = true;
  for (let waiting = [...work()]; waiting.length > 0 && done; waiting = [...work()]) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    done = await Promise.race([
      Promise.all(waiting).then(() => true),
      new Promise<false>(
        (resolve) => (timeout = setTimeout(resolve, Math.max(0, deadline - now()), false)),
      ),
    ]);
    clearTimeout(timeout);
  }
  return done;
}

/**
 * Ends the requests the server is still handling, when a page is left.
 *
 * A request that has its answer is writing the body: a short wait, then a
 * stop. A test can end while a page streams, on data that will never come.
 *
 * A request that has no answer yet runs code of the app, like a Server Action
 * or a route handler, and nothing can stop that. So it is waited for, and
 * then for the body it writes. So is what requests do after their response,
 * like `after()`. What comes next is not to run while any of that still reads
 * or sets the stores of a request, which would be the ones of the requests
 * that come next. A request that is sent in the meantime waits for all of
 * that, and is dropped: it is one of the page that was left.
 */
export async function settleRequests(): Promise<void> {
  generation++;
  const written = queue;
  const settled = Promise.withResolvers<void>();
  queue = settled.promise;
  queued = 0;
  const waited = requestQueued;
  requestQueued = Promise.withResolvers();
  const deadline = now() + settleTimeout;
  try {
    await stopResponses(written);
    if (unanswered.size > 0) {
      if (!(await untilDone(() => unanswered.keys(), deadline))) {
        console.warn(
          `vitest-plugin-rsc: the server was still handling ${[...unanswered.values()].join(", ")} ` +
            `${settleTimeout / 1000}s after the page was left. What comes next runs anyway. ` +
            "Until that request is done, its code and the requests that come next can read and " +
            "set each other's cookies, headers and other values of a request.",
        );
        unanswered.clear();
      }
      // What they answered with is being written from here on.
      await stopResponses(new Promise(() => {}));
    }
    // Also what that work starts while it runs: an `after()` that calls the app.
    const worked = await untilDone(() => backgroundWork, deadline);
    // The requests that would wait for a next one: there is none for them.
    waited.resolve();
    if (!worked) {
      backgroundWork.clear();
      console.warn(
        "vitest-plugin-rsc: `after()` or `waitUntil()` work of a request was still running " +
          `${settleTimeout / 1000}s after a page was left. What comes next runs anyway, and ` +
          "that work may read the stores of the requests that come next.",
      );
    }
  } finally {
    // The requests that were sent while this went on are forgotten too.
    generation++;
    queued = 0;
    waited.resolve();
    requestQueued.resolve();
    requestQueued = Promise.withResolvers();
    settled.resolve();
  }
}

type Route = (typeof allRoutes)[number];

// The route of the node that a test renders, for a request to the pathname of
// its URL. Of the routes of a node, the one with the segments of the app's
// route, so that Next finds the params the app's route has. A URL of no route
// has none, like `/`. With `layouts`, the app's route with the node as its page.
function nodeRouteFor(opened: Opened | undefined, matched: Route | undefined): Route | undefined {
  const node = opened?.node;
  if (!node) return undefined;
  if (!node.layouts) {
    return componentRoutes.get(matched?.pathname ?? "/") ?? componentRoutes.get("/");
  }
  const withLayouts = componentLayoutRoutes.get(matched?.page ?? "");
  if (!withLayouts) {
    throw new Error(
      `vitest-plugin-rsc: \`layouts: true\` renders a node in place of the \`page\` file ` +
        `of its \`url\`, and the app has none for ${opened.pathname}.`,
    );
  }
  return withLayouts;
}

// Next's build lists every Server Action. Here the ones to list are the ones
// a request calls, if the app has them: see action-ids.ts. Next copies the
// list, so it cannot answer for any id. It answers 400 for an id that cannot
// be one, and 409 for one that is not in the list. For an app without a
// Server Action it answers before it looks at the id, but the app here always
// has one: the plugin's own, which is in the list too.
async function serverActionsOf(request: ServerRequest): Promise<object> {
  const own = await registry.ownServerAction;
  const ids = new Set(own ? [own] : []);
  for (const id of await actionIdsOf(request)) {
    if (await registry.hasServerAction(id)) ids.add(id);
  }
  return Object.fromEntries(
    Array.from(ids, (id) => [
      id,
      {
        workers: anyKey(() => ({ moduleId: actionModulePrefix + id, async: true })),
        layer: {},
      },
    ]),
  );
}

async function handle(
  received: ServerRequest,
  unrouted: "not-found" | "pass",
  nested: boolean,
  openedByRequest: Opened | null | undefined,
  pageLoad: boolean,
): Promise<Handled> {
  const request = incoming(received);
  const url = new URL(request.url);
  const opened = openedByRequest === null ? undefined : (openedByRequest ?? openedAt(url));
  const endRequestScope = registry.enterRequestScope();
  // A route of its own, for the page of the route of a node that renders in
  // this request. Not for the requests the server makes to itself meanwhile:
  // see `loadComponent()` in rsc.ts.
  if (openedByRequest) registry.openedByRequest.run(openedByRequest, () => {});
  // What Next does after it has responded, like `after()`, still reads the
  // stores of the request, so the request lasts until that is done. Not
  // forever once another one waits for it: then for one second at most, and
  // so for a nested one, inside the request that waits for it. Leaving the
  // page waits for all of it: see `settleRequests()`.
  const background: Promise<unknown>[] = [];
  const context = {
    waitUntil: (promise: Promise<unknown>) => {
      background.push(promise);
      const work = promise.then(
        () => {},
        () => {},
      );
      backgroundWork.add(work);
      void work.then(() => backgroundWork.delete(work));
    },
  };
  // Also what that work hands to `waitUntil()` while it runs: an `after()`
  // callback that a promise passed to `after()` schedules, once it settles.
  const backgroundSettled = async () => {
    for (let settled = 0; settled < background.length; ) {
      const waiting = background.slice(settled);
      settled = background.length;
      await Promise.allSettled(waiting);
    }
  };
  const endRequest = async () => {
    await Promise.race([
      backgroundSettled(),
      (nested ? Promise.resolve() : nextRequest()).then(
        () => new Promise((resolve) => setTimeout(resolve, backgroundWorkTimeout)),
      ),
    ]);
    endRequestScope();
  };

  try {
    // A body can be read once, and the middleware gets it before the route.
    let { body } = request;
    let middlewareBody: ReadableStream<Uint8Array>;
    if (body instanceof ReadableStream) [middlewareBody, body] = body.tee();
    else middlewareBody = new Blob(body ? [body as BlobPart] : []).stream();

    // What the middleware answers itself, and the headers it sends the
    // request on with.
    let responded: Response | undefined;
    let { headers } = request;
    const invokeMiddleware: InvokeMiddleware = async (target) => {
      // In a deployment the middleware is done before the route starts. So
      // it has a scope of its own here: the route is not to read the stores
      // Next enters for the middleware.
      const endMiddlewareScope = registry.enterRequestScope();
      let response: Response;
      try {
        const middleware = await registry.loadMiddleware();
        response = await middleware(
          { ...request, url: target.url.href, headers: target.headers, body: target.requestBody },
          { ...context, signal: request.signal },
        );
      } catch (error) {
        if (request.signal?.aborted) throw error;
        // Next's request handler does not catch what a middleware throws. The
        // server in front of it does, as `next start`: log it, answer 500.
        console.error(error);
        responded = new registry.Response("Internal Server Error", { status: 500 });
        return { bodySent: true };
      } finally {
        endMiddlewareScope();
      }
      const result = middlewareResult(response, target.headers, target.url);
      if (result.bodySent) responded = response;
      else headers = result.requestHeaders ?? headers;
      return result;
    };
    const proxy = opened?.proxy ?? true;
    // The handlers of `"use cache"`, which the proxy can call too: Next's
    // server loads them before its first request.
    await loadCacheHandlers();
    const resolved = await resolve(request, middlewareBody, invokeMiddleware, proxy);
    // The cache of the server, for the route and for what follows the
    // request. Next makes the middleware one of its own, which stores nothing.
    shareIncrementalCache(headers);
    // The headers of `next.config` and of the middleware, for the response.
    const routedHeaders = resolved.resolvedHeaders ?? new Headers();

    if (responded) {
      return finishWithBody(request, responded, endRequest);
    }
    const redirect = redirectStatus(resolved);
    if (redirect !== undefined) {
      const response = new registry.Response(null, { status: redirect, headers: routedHeaders });
      return finishWithBody(request, response, endRequest);
    }
    if (resolved.externalRewrite) {
      // A rewrite to another server, which `next start` proxies. The browser
      // makes the request, so the browser's rules for one apply: CORS, the
      // headers a script may not set, and a redirect is followed. Not with
      // the `fetch` of the server, which is Next's to cache. And not as a
      // request to this server, which waits for this one: a destination with
      // the origin of the app is the dev server's to answer.
      const hasBody = request.method !== "GET" && request.method !== "HEAD";
      const response = await registry.network(resolved.externalRewrite, {
        method: request.method,
        headers,
        body: hasBody ? await new registry.Response(body as BodyInit).arrayBuffer() : undefined,
        signal: request.signal,
      });
      return finishWithBody(request, response, endRequest, routedHeaders);
    }

    const matched = routes.get(routing.outputs[resolved.resolvedPathname ?? ""] ?? "");
    const component = nodeRouteFor(opened, matched);
    if (!matched && !component && unrouted === "pass") return { finished: endRequest() };
    const page = component?.page ?? matched?.page ?? notFoundPage;
    // What the modules of the route are listed by.
    const entry = component?.component ?? page;
    const routed = { ...request, headers, body };
    // The URL of the request stays the one the browser asked for, as with
    // `next start`: the app has to see where it is. The route is told the
    // rest in the meta of the request, the way `next start` and a deployment
    // adapter tell it: the params of the route, which are the ones of the
    // pathname the resolution ends at, and after a rewrite its query.
    const target = resolved.invocationTarget;
    const query = target && appQuery(Object.entries(target.query));
    const rewrittenPath = target !== undefined && target.pathname !== url.pathname;
    const rewrittenQuery =
      query !== undefined && searchOf(query) !== searchOf(appQuery(url.searchParams));
    // Also for a URL that has a query named like a param of the resolution:
    // Next would take it for one, where `next start` takes it for what it is.
    const namesParam = [...url.searchParams.keys()].some(
      (name) => normalizeNextQueryParam(name) !== null,
    );
    const requestMeta = {
      params:
        target && matched?.pathname.includes("[")
          ? paramsOf(matched.pathname, withoutBasePath(target.pathname))
          : undefined,
      query: rewrittenPath || rewrittenQuery || namesParam ? query : undefined,
    };
    // Next's router asks where a rewrite took its request. `next start` says
    // so for a rewrite of `next.config`, which is the adapter's to do here.
    // Next's own code says it for one of the middleware, with these headers:
    // a rewrite of `next.config` after it changes the pathname once more.
    if (target && query && isRSCRequestHeader(headers.get(RSC_HEADER) ?? undefined)) {
      if (rewrittenPath) {
        routedHeaders.set(NEXT_REWRITTEN_PATH_HEADER, withoutBasePath(target.pathname));
      }
      if (rewrittenQuery && !routedHeaders.has(NEXT_REWRITTEN_QUERY_HEADER)) {
        routedHeaders.set(NEXT_REWRITTEN_QUERY_HEADER, searchOf(query));
      }
    }

    if (!component && matched?.kind === "route") {
      // Next's own request handler finds the params of the route, and
      // answers 500 for a route handler that throws.
      const handler = await registry.loadRouteHandler(page);
      const response = await handleWith(routed, context, handler, requestMeta, {
        headers: routedHeaders,
      });
      return finishWithBody(request, response, endRequest, cookiesOf(routedHeaders));
    }

    setServerActions(await serverActionsOf(routed));
    // Next's build also lists the CSS files of every segment, and Next reads
    // that list before it loads the module of a segment, which it does as it
    // renders. So they are asked for before it renders, as the entry of the
    // route loads.
    // Next puts the CSS in the page only for a page load, not for its router,
    // and decides so itself: this only keeps CSS it would not use out of the
    // list.
    const inline = !isRSCRequestHeader(headers.get(RSC_HEADER) ?? undefined);
    // The route of a node has the stylesheets of the files of the host that
    // render the node: `hostFiles` of `renderServer()`.
    const files = component ? (opened?.node?.files ?? []) : [];
    if (pageLoad && inline) await registry.preloadRoute(entry, files, request.signal);
    const [stylesheets, { handler }] = await Promise.all([
      registry.loadStylesheets(entry, inline, files),
      registry.loadAppPage(entry) as Promise<{ handler: RequestHandler }>,
    ]);
    setStylesheets(stylesheets);
    // Whoever routes a request to the not-found page sets its status, also
    // for a request to `/_not-found` itself. Before the route runs, as
    // `next start` does: Next reads the status while it renders, for the
    // `noindex` tag, and its action handler answers with one of its own.
    const statusCode = page === notFoundPage ? 404 : undefined;
    const response = await handleWith(routed, context, handler, requestMeta, {
      statusCode,
      headers: routedHeaders,
    });
    return finishWithBody(request, response, endRequest, cookiesOf(routedHeaders));
  } catch (error) {
    endRequestScope();
    throw error;
  }
}

// The cookies of the headers the server in front of a route has.
function cookiesOf(headers: Headers): Headers {
  const cookies = new Headers();
  for (const cookie of headers.getSetCookie()) cookies.append("set-cookie", cookie);
  return cookies;
}

// Calls `onFinish` once the server has written the whole body, read or not.
function finishWithBody(
  request: ServerRequest,
  response: Response,
  onFinish: () => Promise<void>,
  routedHeaders?: Headers,
): Handled {
  let finished: Promise<void>;
  let body: ReadableStream<Uint8Array> | null = null;
  if (response.body) {
    // Without a limit on what waits to be read: the server writes on, read or not.
    const pipe = new TransformStream<Uint8Array, Uint8Array>(undefined, undefined, {
      highWaterMark: Infinity,
    });
    const stopping = new AbortController();
    // Stops the render that writes the body. So does cancelling the body.
    const stop = () => stopping.abort();
    rendering.add(stop);
    body = pipe.readable;
    const source = response.body;
    finished = source
      .pipeTo(pipe.writable, { signal: stopping.signal, preventCancel: true })
      // Either way the render ends as an abort, which is what a browser that
      // leaves a page is to a server: Next does not report it as an error of
      // the app.
      .catch(() =>
        source.cancel(
          new DOMException("The page was left before the server had sent it.", "AbortError"),
        ),
      )
      .catch(() => {})
      .finally(() => {
        rendering.delete(stop);
        return onFinish();
      });
  } else {
    finished = onFinish();
  }

  // The headers the server in front of the route has for the response, under
  // the ones of the route itself. A cookie of either is set. A route of the
  // app gets the others before it runs, see `handleWith()`: it adds to some.
  let { headers } = response;
  if (routedHeaders) {
    headers = new Headers(routedHeaders);
    response.headers.forEach((value, name) => {
      if (name === "set-cookie") headers.append(name, value);
      else headers.set(name, value);
    });
  }
  // Next leaves dropping the body of a HEAD to the server in front of it.
  const result = new registry.Response(request.method === "HEAD" ? null : body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  return { response: result, finished };
}
