import { setManifestsSingleton } from "next/dist/server/app-render/manifests-singleton";
import * as appPageModule from "next/dist/server/route-modules/app-page/module";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex";
import { getSortedRoutes } from "next/dist/shared/lib/router/utils/sorted-routes";
import { routes as allRoutes } from "virtual:vitest-plugin-rsc/next-manifest";
import { shareIncrementalCache } from "./cache.ts";
import { registerModuleLoader } from "./client-modules.ts";
import { anyKey, clientReferenceManifest, handlePage, handleRouteHandler } from "./node-server.ts";
import { actionModulePrefix, registry, type ServerRequest } from "./registry.ts";

export { resetCaches } from "./cache.ts";

// The ssr layer: Next's request handler and HTML renderer. node-server.ts is
// what Next's Node.js server has around them, and a tab does not.

registry.ssr = { AppPageRouteModule: appPageModule.AppPageRouteModule as never };
registerModuleLoader("ssr");

// The routes of the app, and the route of a node for each of their
// pathnames: see `handle()`.
const routes = allRoutes.filter((route) => !route.component);
const componentRoutes = new Map(
  allRoutes.filter((route) => route.component).map((route) => [route.pathname, route]),
);

const notFoundPage = "/_not-found/page";
const matchers = getSortedRoutes(
  routes.filter((route) => route.page !== notFoundPage).map((route) => route.pathname),
).map((pathname) => ({
  route: routes.find((route) => route.pathname === pathname)!,
  match: getRouteMatcher(getRouteRegex(pathname)),
}));

type RouteParams = Record<string, string | string[] | undefined>;

function matchRoute(pathname: string) {
  for (const { route, match } of matchers) {
    const params = match(pathname) as RouteParams | false;
    if (params) return { route, params };
  }
}

/**
 * Whether a pathname is a route of the app, a page or a route handler, or the
 * route of the node a test renders.
 */
export function isRoute(pathname: string): boolean {
  return registry.component?.pathname === pathname || matchRoute(pathname) !== undefined;
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

/**
 * The Next.js server of this app. `nested` is for a request the server makes
 * to itself while it handles one, which cannot wait for that one to finish.
 */
export function handleRequest(request: ServerRequest, nested = false): Promise<Response> {
  if (nested) return handle(request);
  const requested = generation;
  const result = queue.then(() => {
    if (requested !== generation) {
      throw new DOMException("The page was left before the server responded.", "AbortError");
    }
    return handle(request);
  });
  // The next request waits for the body too: the server writes it as it
  // renders, long after the response is there.
  queue = result.then(
    (response) => (response as Response & { finished?: Promise<void> }).finished,
    () => {},
  );
  return result;
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

async function handle(request: ServerRequest): Promise<Response> {
  const { pathname } = new URL(request.url);
  const matched = matchRoute(pathname);
  // While a test renders a node, the pathname of its URL is the node's route.
  // Of the routes of a node, the one with the segments of the app's route, so
  // that Next finds the params the app's route has. A URL of no route has
  // none, like `/`.
  const component =
    registry.component?.pathname === pathname
      ? (componentRoutes.get(matched?.route.pathname ?? "/") ?? componentRoutes.get("/"))
      : undefined;
  const page = component?.page ?? matched?.route.page ?? notFoundPage;
  // What the modules of the route are listed by.
  const entry = component?.component ?? page;
  const endRequestScope = registry.enterRequestScope();
  shareIncrementalCache(request.headers);
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
    if (!component && matched?.route.kind === "route") {
      // Next's own request handler finds the params of the route, and
      // answers 500 for a route handler that throws.
      const handler = await registry.loadRouteHandler(page);
      const response = await handleRouteHandler(request, context, handler);
      return finishWithBody(request, response, response.status, endRequest);
    }

    // Next's build lists every Server Action. Here the only one to list is
    // the one this request calls, if the app has it. Next copies the list, so
    // it cannot answer for any id, and answers 409 for one that is not in it.
    const actionId = request.method === "POST" ? request.headers.get("next-action") : null;
    const actions =
      actionId && (await registry.hasServerAction(actionId))
        ? {
            [actionId]: {
              workers: anyKey(() => ({ moduleId: actionModulePrefix + actionId, async: true })),
              layer: {},
            },
          }
        : {};
    setManifestsSingleton({
      page,
      clientReferenceManifest: clientReferenceManifest as never,
      serverActionsManifest: { node: actions, edge: actions, encryptionKey: "" } as never,
    });

    await registry.loadAppPage(entry);
    const response = await handlePage(request, context, page, entry);
    // Whoever routes a request to the not-found page sets its status.
    const status = component || matched ? response.status : 404;
    return finishWithBody(request, response, status, endRequest);
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
): Response {
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

  // Next leaves dropping the body of a HEAD to the server in front of it.
  const result = new registry.Response(request.method === "HEAD" ? null : body, {
    status,
    statusText: response.statusText,
    headers: response.headers,
  });
  return Object.assign(result, { finished });
}
