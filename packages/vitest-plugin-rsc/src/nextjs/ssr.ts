import {
  resolveRoutes,
  responseToMiddlewareResult,
  type MiddlewareContext,
  type MiddlewareResult,
  type ResolveRoutesResult,
} from "@next/routing";
import {
  NEXT_REWRITTEN_PATH_HEADER,
  NEXT_REWRITTEN_QUERY_HEADER,
  NEXT_RSC_UNION_QUERY,
  RSC_HEADER,
} from "next/dist/client/components/app-router-headers";
import { isRSCRequestHeader } from "next/dist/server/lib/is-rsc-request";
import { filterInternalHeaders } from "next/dist/server/lib/server-ipc/utils";
import * as appPageModule from "next/dist/server/route-modules/app-page/module";
import {
  fromNodeOutgoingHttpHeaders,
  normalizeNextQueryParam,
  toNodeOutgoingHttpHeaders,
} from "next/dist/server/web/utils";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex";
import { routes as allRoutes, routing } from "virtual:vitest-plugin-rsc/next-manifest";
import { shareIncrementalCache } from "./cache.ts";
import { registerModuleLoader } from "./client-modules.ts";
import { anyKey, handleRequest as handleWith, setServerActions } from "./node-server.ts";
import {
  actionModulePrefix,
  registry,
  type Opened,
  type RequestHandler,
  type ServerRequest,
} from "./registry.ts";

export { resetCaches } from "./cache.ts";

// The ssr layer: Next's request handler and HTML renderer. node-server.ts is
// what Next's Node.js server has around them, and a tab does not.

registry.ssr = { AppPageRouteModule: appPageModule.AppPageRouteModule as never };
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
// The pathnames of what Next's build made, as its docs for an adapter list
// them for `resolveRoutes()`.
const pathnames = Object.keys(routing.outputs);

type InvokeMiddleware = (context: MiddlewareContext) => Promise<MiddlewareResult>;

// A request as it comes in: without the headers that only Next's own server
// sets on one, like `x-middleware-set-cookie` for the cookies of the
// middleware. `next start` takes them off with the same function, before
// anything reads the request.
function incoming<T extends Pick<ServerRequest, "headers">>(request: T): T {
  const headers = toNodeOutgoingHttpHeaders(request.headers) as Record<string, string | string[]>;
  filterInternalHeaders(headers);
  return { ...request, headers: fromNodeOutgoingHttpHeaders(headers) };
}

// The server in front of the app: Next's own route resolution, with the
// routes its build hands a deployment adapter. It goes through the redirects,
// rewrites and headers of `next.config`, the middleware, and the routes of the
// app, in the order of a deployment. Without `proxy`, only through the routes
// of the app: see `NextRouting.appRoutes`.
function resolve(
  request: Pick<ServerRequest, "url" | "headers">,
  requestBody: ReadableStream<Uint8Array>,
  invokeMiddleware: InvokeMiddleware,
  proxy: boolean,
): Promise<ResolveRoutesResult> {
  return resolveRoutes({
    url: new URL(request.url),
    headers: request.headers,
    requestBody,
    basePath: routing.basePath,
    buildId: routing.buildId,
    pathnames,
    routes: proxy ? routing.routes : routing.appRoutes,
    invokeMiddleware,
  });
}

// What `renderServer()` opened, for a request that belongs to it: one to its
// pathname. That is the document, and what the page sends there while it is
// open: a Server Action, `router.refresh()`, a change of search params. A
// request to another pathname is the app's, as always.
function openedAt(url: URL): Opened | undefined {
  const { opened } = registry;
  return opened?.pathname === url.pathname ? opened : undefined;
}

// What the resolution answers with a redirect: one of `next.config`, of the
// middleware, or the one to a URL without its trailing slash.
function redirectStatus(resolved: ResolveRoutesResult): number | undefined {
  const status = resolved.redirect?.status ?? resolved.status;
  return status !== undefined && status >= 300 && status < 400 ? status : undefined;
}

/**
 * Whether the server has something for a request: a route of the app, a page
 * or a route handler, the route of the node a test renders, a redirect or a
 * rewrite of `next.config`, or a middleware whose matcher takes it. Only
 * running the middleware tells what it does with the request. At the pathname
 * a test opened without `proxy`, only the routes count.
 *
 * Nothing runs for the answer, and nothing waits for it.
 */
export async function takesRequest(
  request: Pick<ServerRequest, "url" | "headers">,
): Promise<boolean> {
  const opened = openedAt(new URL(request.url));
  if (opened?.node) return true;
  let matched = false;
  const invokeMiddleware = async () => {
    matched = true;
    return {};
  };
  const proxy = opened?.proxy ?? true;
  const resolved = await resolve(incoming(request), new ReadableStream(), invokeMiddleware, proxy);
  return (
    matched ||
    redirectStatus(resolved) !== undefined ||
    resolved.externalRewrite !== undefined ||
    routing.outputs[resolved.resolvedPathname ?? ""] !== undefined
  );
}

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

// One request at a time: see `enterAmbientScope`.
let queue: Promise<unknown> = Promise.resolve();
// How to stop the renders whose response is still being written.
const rendering = new Set<() => void>();
// Changes when the test moves on, for the requests that were still waiting.
let generation = 0;
const backgroundWorkTimeout = 1000;

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
  { nested = false, unrouted = "not-found" }: HandleOptions = {},
): Promise<Response | undefined> {
  if (nested) return handle(request, unrouted).then(({ response }) => response);
  const requested = generation;
  const result = queue.then(() => {
    if (requested !== generation) {
      throw new DOMException("The page was left before the server responded.", "AbortError");
    }
    return handle(request, unrouted);
  });
  // The next request waits for the body too: the server writes it as it
  // renders, long after the response is there.
  queue = result.then(
    ({ finished }) => finished,
    () => {},
  );
  return result.then(({ response }) => response);
}

/**
 * Ends the requests the server is still handling: a short wait, then a stop.
 * A test can end while a page streams, on data that will never come.
 */
export async function settleRequests(): Promise<void> {
  generation++;
  const pending = queue;
  queue = Promise.resolve();
  await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, 100))]);
  for (const stop of rendering) stop();
  rendering.clear();
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

// Next's build lists every Server Action. Here the only one to list is the
// one a request calls, if the app has it. Next copies the list, so it cannot
// answer for any id, and answers 409 for one that is not in it.
async function serverActionsOf(method: string, headers: Headers): Promise<object> {
  const actionId = method === "POST" ? headers.get("next-action") : null;
  if (!actionId || !(await registry.hasServerAction(actionId))) return {};
  return {
    [actionId]: {
      workers: anyKey(() => ({ moduleId: actionModulePrefix + actionId, async: true })),
      layer: {},
    },
  };
}

async function handle(received: ServerRequest, unrouted: "not-found" | "pass"): Promise<Handled> {
  const request = incoming(received);
  const url = new URL(request.url);
  const opened = openedAt(url);
  const endRequestScope = registry.enterRequestScope();
  // What Next does after it has responded, like `after()`, still reads the
  // stores of the request. Not forever: the next request waits for this one.
  const background: Promise<unknown>[] = [];
  const context = {
    waitUntil: (promise: Promise<unknown>) => void background.push(promise),
  };
  const endRequest = async () => {
    await Promise.race([
      Promise.allSettled(background),
      new Promise((resolve) => setTimeout(resolve, backgroundWorkTimeout)),
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
      const result = responseToMiddlewareResult(response, target.headers, target.url);
      if (result.bodySent) responded = response;
      else headers = result.requestHeaders ?? headers;
      return result;
    };
    const proxy = opened?.proxy ?? true;
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
      // A rewrite to another server, which `next start` proxies. The tab
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
      const response = await handleWith(routed, context, handler, requestMeta);
      return finishWithBody(request, response, endRequest, routedHeaders);
    }

    setServerActions(await serverActionsOf(request.method, headers));

    const { handler } = (await registry.loadAppPage(entry)) as { handler: RequestHandler };
    // Whoever routes a request to the not-found page sets its status, also
    // for a request to `/_not-found` itself. Before the route runs, as
    // `next start` does: Next reads the status while it renders, for the
    // `noindex` tag, and its action handler answers with one of its own.
    const status = page === notFoundPage ? 404 : undefined;
    const response = await handleWith(routed, context, handler, requestMeta, status);
    return finishWithBody(request, response, endRequest, routedHeaders);
  } catch (error) {
    endRequestScope();
    throw error;
  }
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
  // the ones of the route itself. A cookie of either is set.
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
