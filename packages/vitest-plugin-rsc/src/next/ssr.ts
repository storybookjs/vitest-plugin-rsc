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
    // puts it in the HTML. Nothing loads it here: `visit()` starts the app.
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
  page: routes.find((route) => route.pathname === pathname)!.page,
  match: getRouteMatcher(getRouteRegex(pathname)),
}));

// One request at a time: see `enterAmbientScope`.
let queue: Promise<unknown> = Promise.resolve();
// The renders whose response is still being written, and how to stop them.
const rendering = new Set<() => void>();
// Changes when the test moves on, for the requests that were still waiting.
let generation = 0;

/**
 * The Next.js server of this app. A pathname that is not a page gets the
 * app's not-found page, as it does from a deployment.
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
  const matched = matchers.find(({ match }) => match(pathname))?.page;
  const page = matched ?? notFoundPage;
  const endRequestScope = registry.enterRequestScope();

  try {
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
    const response = await handler(request, { waitUntil() {}, signal: request.signal });
    // The not-found page does not know it is one: whoever routes a request to
    // it sets the status. For a deployment that is the platform's router.
    return finishWithBody(response, matched ? response.status : 404, endRequestScope);
  } catch (error) {
    endRequestScope();
    throw error;
  }
}

// Calls `onFinish` once the server has written the whole body, whether or not
// anyone reads it.
function finishWithBody(response: Response, status: number, onFinish: () => void): Response {
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
        onFinish();
      }
    })();
  } else {
    onFinish();
  }

  const result = new registry.Response(body, {
    status,
    statusText: response.statusText,
    headers: response.headers,
  });
  return Object.assign(result, { finished });
}
