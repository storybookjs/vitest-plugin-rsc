import { setManifestsSingleton } from "next/dist/server/app-render/manifests-singleton";
import * as appPageModule from "next/dist/server/route-modules/app-page/module";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex";
import { getSortedRoutes } from "next/dist/shared/lib/router/utils/sorted-routes";
import edgeEntries from "virtual:vitest-plugin-rsc/next-edge-entries";
import { nextConfig, routes } from "virtual:vitest-plugin-rsc/next-manifest";
import { registerModuleLoader } from "./client-modules.ts";
import { actionModulePrefix, registry, type ServerRequest } from "./registry.ts";

// The ssr layer: Next's request handler and HTML renderer. Each route is the
// edge entry Next builds for a deployment: `handler(Request)` in, `Response`
// out.

registry.ssr = { AppPageRouteModule: appPageModule.AppPageRouteModule as never };
registerModuleLoader("ssr");

const anyKey = <T>(create: (key: string) => T) =>
  new Proxy({} as Record<string, T>, {
    get: (_, key) => (typeof key === "string" ? create(key) : undefined),
    has: () => true,
  });

// Next's build writes a manifest of every client reference: which chunk it is
// in for the browser, which module it is for the HTML renderer. Vite RSC needs
// neither, a reference is its module id, so this one answers for any id.
const clientReference = anyKey((id) => anyKey((name) => ({ id, name, chunks: [], async: true })));
const clientReferenceManifest = {
  moduleLoading: { prefix: "", crossOrigin: null },
  clientModules: anyKey((id) => ({ id, name: "*", chunks: [], async: true })),
  ssrModuleMapping: clientReference,
  edgeSSRModuleMapping: clientReference,
  rscModuleMapping: clientReference,
  edgeRscModuleMapping: clientReference,
  entryCSSFiles: anyKey(() => []),
  entryJSFiles: anyKey(() => []),
};

// What Next's build writes into every edge bundle: the config and the
// manifests the route module reads when it prepares a request.
Object.assign(globalThis, {
  __SERVER_FILES_MANIFEST: { config: nextConfig },
  __BUILD_MANIFEST: {
    polyfillFiles: [],
    // The script that starts the app in the browser. Next requires one and
    // puts it in the HTML. Nothing loads it here: `renderServer()` starts the app.
    rootMainFiles: ["static/chunks/main-app.js"],
    devFiles: [],
    lowPriorityFiles: [],
    pages: {},
  },
  __RSC_MANIFEST: anyKey(() => clientReferenceManifest),
});

const notFoundPage = "/_not-found/page";
const matchers = getSortedRoutes(
  routes.filter((route) => route.page !== notFoundPage).map((route) => route.pathname),
).map((pathname) => ({
  route: routes.find((route) => route.pathname === pathname)!,
  match: getRouteMatcher(getRouteRegex(pathname)),
}));

type RouteParams = Record<string, string | string[] | undefined>;

// The route that serves a pathname, a page or a route handler, and the
// params of its dynamic segments.
function matchRoute(pathname: string) {
  for (const { route, match } of matchers) {
    const params = match(pathname) as RouteParams | false;
    if (params) return { route, params };
  }
}

/** Whether a pathname is a route of the app: a page or a route handler. */
export function isRoute(pathname: string): boolean {
  return matchRoute(pathname) !== undefined;
}

/** The page of the route that serves a pathname, if a page serves it. */
export function pageOf(pathname: string): string | undefined {
  const route = matchRoute(pathname)?.route;
  return route?.kind === "page" ? route.page : undefined;
}

// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;

// One request at a time: see `enterAmbientScope`.
let queue: Promise<unknown> = Promise.resolve();
// The renders whose response is still being written, and how to stop them.
const rendering = new Set<() => void>();
// Changes when the test moves on, for the requests that were still waiting.
let generation = 0;
// How long a request waits, after its response, for the work Next does then.
const backgroundWorkTimeout = 1000;

/**
 * The Next.js server of this app: its pages and its route handlers. A
 * pathname that is not a route gets the app's not-found page, as it does from
 * a deployment.
 *
 * `nested` is for a request the server makes to itself while it handles one,
 * which cannot wait for that one to finish.
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
 * Ends the requests the server is still handling: a short wait for the ones
 * that are about done, then a stop. A test can end while a page is still
 * streaming, on data that will never come.
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
  const page = matched?.route.page ?? notFoundPage;
  const endRequestScope = registry.enterRequestScope();
  // What Next still does for a request after it has responded, like the
  // callbacks of `after()`. The request lasts until that is done, so that
  // they still read its stores. Not forever: the next request waits for this
  // one, and work that a test holds up, or its fake timers, must not stop it.
  const background: Promise<unknown>[] = [];
  const context = {
    waitUntil: (promise: Promise<unknown>) => void background.push(promise),
    signal: request.signal,
  };
  const endRequest = async () => {
    await Promise.race([
      Promise.allSettled(background),
      new Promise((resolve) => setTimeout(resolve, backgroundWorkTimeout)),
    ]);
    endRequestScope();
  };

  try {
    if (matched?.route.kind === "route") {
      // An edge function of Next does not match its own route. It gets the
      // params of the dynamic segments from whoever routes the request to it,
      // in the query of the URL. This is what `next start` does.
      const url = new URL(request.url);
      for (const [name, value] of Object.entries(matched.params)) {
        url.searchParams.delete(name);
        for (const item of [value ?? []].flat()) url.searchParams.append(name, item);
      }
      const handler = await registry.loadRouteHandler(page);
      let response: Response;
      try {
        response = await handler({ ...request, url: url.href }, context);
      } catch (error) {
        if (request.signal?.aborted) throw error;
        // Next's route module rethrows what a handler throws, and the edge
        // entry does not catch it: the server in front of it logs the error
        // and answers 500, which is what `next start` does.
        console.error(error);
        response = new registry.Response("Internal Server Error", { status: 500 });
      }
      return finishWithBody(request, response, response.status, endRequest);
    }

    // Next's build lists every Server Action. Here an action is its module id
    // and export, so the only one to list is the one this request calls.
    const actionId = request.headers.get("next-action");
    const actions = actionId
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

    await registry.loadAppPage(page);
    const { handler } = await edgeEntries[page]!();
    const response = await handler(request, context);
    // The not-found page does not know it is one: whoever routes a request to
    // it sets the status. For a deployment that is the platform's router.
    return finishWithBody(request, response, matched ? response.status : 404, endRequest);
  } catch (error) {
    endRequestScope();
    throw error;
  }
}

// Calls `onFinish` once the server has written the whole body, whether or not
// anyone reads it.
function finishWithBody(
  request: ServerRequest,
  response: Response,
  status: number,
  onFinish: () => Promise<void>,
): Response {
  let finished: Promise<void> = Promise.resolve();
  let body: ReadableStream<Uint8Array> | null = null;
  if (response.body) {
    const reader = response.body.getReader();
    // Cancelling the body stops the render that writes it.
    const stop = () =>
      void reader
        .cancel(new Error("The page was left before the server had sent it."))
        .catch(() => {});
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    body = new ReadableStream({ start: (c) => void (controller = c), cancel: stop });
    rendering.add(stop);
    finished = (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        try {
          controller.error(error);
        } catch {
          // The reader of the body has left.
        }
      } finally {
        rendering.delete(stop);
        await onFinish();
      }
    })();
  } else {
    finished = onFinish();
  }

  // Next answers HEAD with the response to a GET. Its edge wrapper leaves
  // dropping the body to the server in front of it.
  const result = new registry.Response(request.method === "HEAD" ? null : body, {
    status,
    statusText: response.statusText,
    headers: response.headers,
  });
  return Object.assign(result, { finished });
}
