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
import * as appPageModule from "next/dist/server/route-modules/app-page/module";
import { normalizeNextQueryParam } from "next/dist/server/web/utils";
import { routes as allRoutes, routing } from "virtual:vitest-plugin-rsc/next-manifest";
import { shareIncrementalCache } from "./cache.ts";
import { registerModuleLoader } from "./client-modules.ts";
import { anyKey, handleRequest as handleWith, setServerActions } from "./node-server.ts";
import {
  actionModulePrefix,
  registry,
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
  allRoutes.filter((route) => route.component).map((route) => [route.pathname, route]),
);

const notFoundPage = "/_not-found/page";
// The pathnames of what Next's build made, as its docs for an adapter list
// them for `resolveRoutes()`.
const pathnames = Object.keys(routing.outputs);

type InvokeMiddleware = (context: MiddlewareContext) => Promise<MiddlewareResult>;

// The server in front of the app: Next's own route resolution, with the
// routes its build hands a deployment adapter. It goes through the redirects,
// rewrites and headers of `next.config`, the middleware, and the routes of the
// app, in the order of a deployment.
function resolve(
  request: Pick<ServerRequest, "url" | "headers">,
  requestBody: ReadableStream<Uint8Array>,
  invokeMiddleware: InvokeMiddleware,
): Promise<ResolveRoutesResult> {
  return resolveRoutes({
    url: new URL(request.url),
    headers: request.headers,
    requestBody,
    basePath: routing.basePath,
    buildId: routing.buildId,
    pathnames,
    routes: routing.routes,
    invokeMiddleware,
  });
}

// What the resolution answers with a redirect: one of `next.config`, of the
// middleware, or the one to a URL without its trailing slash.
function redirectStatus(resolved: ResolveRoutesResult): number | undefined {
  const status = resolved.redirect?.status ?? resolved.status;
  return status !== undefined && status >= 300 && status < 400 ? status : undefined;
}

/**
 * Whether the server has something for a request: a route of the app, a page
 * or a route handler, the route of the node a test renders, or a redirect or a
 * rewrite of `next.config`. And, with `middleware`, whether the matcher of the
 * middleware takes it: only running it tells what it does.
 *
 * Nothing runs for the answer, and nothing waits for it.
 */
export async function takesRequest(
  request: Pick<ServerRequest, "url" | "headers">,
  middleware: boolean,
): Promise<boolean> {
  if (registry.component?.pathname === new URL(request.url).pathname) return true;
  let matched = false;
  const resolved = await resolve(request, new ReadableStream(), async () => {
    matched = true;
    return {};
  });
  return (
    (matched && middleware) ||
    redirectStatus(resolved) !== undefined ||
    resolved.externalRewrite !== undefined ||
    routing.outputs[resolved.resolvedPathname ?? ""] !== undefined
  );
}

// The query of a URL as the app has it. Without the params of the route,
// which are in the query that the resolution ends with, under the names Next
// gives them for a server in front of its own, like `nxtPid`. And without
// what Next's router adds to a request of its own.
function searchOf(query: Iterable<[string, string | string[]]>): string {
  const search = new URLSearchParams();
  for (const [name, value] of query) {
    if (normalizeNextQueryParam(name) !== null || name === NEXT_RSC_UNION_QUERY) continue;
    for (const item of [value].flat()) search.append(name, item);
  }
  return search.toString();
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

async function handle(request: ServerRequest, unrouted: "not-found" | "pass"): Promise<Handled> {
  const url = new URL(request.url);
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
    const resolved = await resolve(request, middlewareBody, async (target) => {
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
    });
    // The cache of the server, for the route and for what follows the
    // request. Next makes the middleware one of its own, which stores nothing.
    shareIncrementalCache(headers);
    // The headers of `next.config` and of the middleware, for the response.
    const routedHeaders = resolved.resolvedHeaders ?? new Headers();

    if (responded) {
      return finishWithBody(request, responded, responded.status, endRequest);
    }
    const redirect = redirectStatus(resolved);
    if (redirect !== undefined) {
      const response = new registry.Response(null, { status: redirect, headers: routedHeaders });
      return finishWithBody(request, response, redirect, endRequest);
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
      return finishWithBody(request, response, response.status, endRequest, routedHeaders);
    }

    const matched = routes.get(routing.outputs[resolved.resolvedPathname ?? ""] ?? "");
    // While a test renders a node, the pathname of its URL is the node's route.
    // Of the routes of a node, the one with the segments of the app's route, so
    // that Next finds the params the app's route has. A URL of no route has
    // none, like `/`.
    const component =
      registry.component?.pathname === url.pathname
        ? (componentRoutes.get(matched?.pathname ?? "/") ?? componentRoutes.get("/"))
        : undefined;
    if (!matched && !component && unrouted === "pass") return { finished: endRequest() };
    const page = component?.page ?? matched?.page ?? notFoundPage;
    // What the modules of the route are listed by.
    const entry = component?.component ?? page;
    const routed = { ...request, headers, body };
    // The URL of the request stays the one the browser asked for, as with
    // `next start`: the app has to see where it is. The route is told in the
    // meta of the request, the way a deployment adapter tells it: the query
    // the resolution ends with, which has the query of where a rewrite went
    // and the params of the route. Next's route module takes those params
    // over what the pathname says, and out of the query.
    const target = resolved.invocationTarget;
    const requestMeta = { query: target?.query };
    // Next's router asks where a rewrite took its request. `next start` says
    // so for a rewrite of `next.config`, which is the adapter's to do here.
    // Next's own code says it for one of the middleware, with these headers:
    // a rewrite of `next.config` after it changes the pathname once more.
    if (target && isRSCRequestHeader(headers.get(RSC_HEADER) ?? undefined)) {
      if (target.pathname !== url.pathname) {
        routedHeaders.set(NEXT_REWRITTEN_PATH_HEADER, target.pathname);
      }
      const search = searchOf(Object.entries(target.query));
      if (
        search !== searchOf(url.searchParams) &&
        !routedHeaders.has(NEXT_REWRITTEN_QUERY_HEADER)
      ) {
        routedHeaders.set(NEXT_REWRITTEN_QUERY_HEADER, search);
      }
    }

    if (!component && matched?.kind === "route") {
      // Next's own request handler finds the params of the route, and
      // answers 500 for a route handler that throws.
      const handler = await registry.loadRouteHandler(page);
      const response = await handleWith(routed, context, handler, requestMeta);
      return finishWithBody(request, response, response.status, endRequest, routedHeaders);
    }

    // Next's build lists every Server Action. Here the only one to list is
    // the one this request calls, if the app has it. Next copies the list, so
    // it cannot answer for any id, and answers 409 for one that is not in it.
    const actionId = request.method === "POST" ? headers.get("next-action") : null;
    const actions =
      actionId && (await registry.hasServerAction(actionId))
        ? {
            [actionId]: {
              workers: anyKey(() => ({ moduleId: actionModulePrefix + actionId, async: true })),
              layer: {},
            },
          }
        : {};
    setServerActions(actions);

    const { handler } = (await registry.loadAppPage(entry)) as { handler: RequestHandler };
    const response = await handleWith(routed, context, handler, requestMeta);
    // Whoever routes a request to the not-found page sets its status.
    const status = component || matched ? response.status : 404;
    return finishWithBody(request, response, status, endRequest, routedHeaders);
  } catch (error) {
    endRequestScope();
    throw error;
  }
}

// Calls `onFinish` once the server has written the whole body, read or not.
function finishWithBody(
  request: ServerRequest,
  response: Response,
  status: number,
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
    status,
    statusText: response.statusText,
    headers,
  });
  return { response: result, finished };
}
