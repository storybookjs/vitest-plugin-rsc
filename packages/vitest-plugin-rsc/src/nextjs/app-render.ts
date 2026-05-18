import { Buffer } from "node:buffer";
import {
  ACTION_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_URL,
  RSC_CONTENT_TYPE_HEADER,
  RSC_HEADER,
} from "next/dist/client/components/app-router-headers.js";
import { renderToHTMLOrFlight } from "next/dist/server/app-render/app-render.js";
import { WebNextRequest, WebNextResponse } from "next/dist/server/base-http/web.js";
import { defaultConfig } from "next/dist/server/config-shared.js";
import { createSnapshot } from "next/dist/server/app-render/async-local-storage.js";
import { IncrementalCache } from "next/dist/server/lib/incremental-cache/index.js";
import type { CacheHandler } from "next/dist/server/lib/cache-handlers/types.js";
import { tagsManifest } from "next/dist/server/lib/incremental-cache/tags-manifest.external.js";
import { NEXT_PATCH_SYMBOL } from "next/dist/server/lib/patch-fetch.js";
import { addRequestMeta } from "next/dist/server/request-meta.js";
import { initializeCacheHandlers, setCacheHandler } from "next/dist/server/use-cache/handlers.js";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import type RenderResult from "next/dist/server/render-result.js";
import type { InitialRSCPayload } from "next/dist/shared/lib/app-router-types";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths.js";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher.js";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";
import { patchBufferIndexOfUint8ArrayNeedle } from "./buffer-compat.ts";
import {
  createNextServerActionManifest,
  emptyServerActionsManifest,
} from "./src/build/webpack/plugins/flight-client-entry-plugin.ts";
import {
  emptyClientReferenceManifest,
  htmlClientReferenceManifest,
} from "./src/build/webpack/plugins/flight-manifest-plugin.ts";
import { createAppPageRouteModule } from "./src/build/templates/app-page.ts";
import {
  createNextHttpAccessFallbackError,
  getNextHttpAccessFallbackStatus,
  getNextRedirectUrlFromFlightPayloadText,
} from "./src/client/app-index.ts";
import {
  createNextRenderOpts,
  readNextDefineNumber,
  readNextDefineObject,
  type RequestLifecycle,
} from "./src/server/app-render/types.ts";
import {
  setNextRenderManifests,
  type NextRenderManifests,
} from "./src/server/app-render/manifests-singleton.ts";
import { ensureNextEdgeIncrementalCache } from "./src/server/web/adapter.ts";

type NextIncrementalCacheConstructor =
  typeof import("next/dist/server/lib/incremental-cache/index.js").IncrementalCache;

export type NextInitialRscPayload = InitialRSCPayload;
export type NextNavigationFlightPayload = Partial<InitialRSCPayload> & Pick<InitialRSCPayload, "f">;

export class NextAppRenderRedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT;${url}`);
    this.name = "NextAppRenderRedirectError";
  }
}

export function isNextAppRenderRedirectError(error: unknown): error is NextAppRenderRedirectError {
  return error instanceof NextAppRenderRedirectError;
}

let NextIncrementalCache: NextIncrementalCacheConstructor | undefined;
let nextCacheGeneration = 0;
let nextCacheHandlersPromise: Promise<void> | undefined;

export async function renderNextRouteFlightResponse({
  loaderTree,
  route,
  page,
  url,
  routerState,
  headers,
  componentMod,
}: {
  loaderTree: LoaderTree;
  route: string;
  page: string;
  url: string;
  routerState?: string | null;
  headers?: Headers | Record<string, string>;
  componentMod?: NextEntryBaseComponentMod;
}): Promise<Response> {
  const location = new URL(url, "http://localhost");
  const requestHeaders = headers instanceof Headers ? new Headers(headers) : new Headers(headers);
  requestHeaders.set(RSC_HEADER, "1");
  if (routerState) {
    requestHeaders.set(NEXT_ROUTER_STATE_TREE_HEADER, routerState);
  }

  const manifests = {
    page,
    clientReferenceManifest: emptyClientReferenceManifest,
    serverActionsManifest: emptyServerActionsManifest,
  } satisfies NextRenderManifests;
  await setNextRenderManifests(manifests);

  return renderNextRouteResult({
    loaderTree,
    route,
    page,
    location,
    request: createAppRenderRequest(location.href, {
      headers: requestHeaders,
    }),
    componentMod,
    manifests,
  });
}

export async function renderNextRouteHtmlResponse({
  loaderTree,
  route,
  page,
  url,
  headers,
  componentMod,
}: {
  loaderTree: LoaderTree;
  route: string;
  page: string;
  url: string;
  headers?: Headers | Record<string, string>;
  componentMod?: NextEntryBaseComponentMod;
}): Promise<Response> {
  const location = new URL(url, "http://localhost");
  const requestHeaders = headers instanceof Headers ? new Headers(headers) : new Headers(headers);
  const manifests = {
    page,
    clientReferenceManifest: htmlClientReferenceManifest,
    serverActionsManifest: emptyServerActionsManifest,
  } satisfies NextRenderManifests;
  await setNextRenderManifests(manifests);

  return renderNextRouteResult({
    loaderTree,
    route,
    page,
    location,
    request: createAppRenderRequest(location.href, {
      headers: requestHeaders,
    }),
    componentMod,
    manifests,
  });
}

export async function renderNextRouteInitialPayload(options: {
  loaderTree: LoaderTree;
  route: string;
  page: string;
  url: string;
  headers?: Headers | Record<string, string>;
  componentMod?: NextEntryBaseComponentMod;
}): Promise<NextNavigationFlightPayload> {
  const response = await renderNextRouteFlightResponse(options);
  if (response.status >= 400) {
    await response.body?.cancel();
    throw createNextHttpAccessFallbackError(response.status);
  }

  if (!response.body) {
    throw new Error("Next app-render did not return an RSC response body.");
  }

  const [inspectionStream, payloadStream] = response.body.tee();
  const flightPayloadText = await readReadableStreamText(inspectionStream);
  const accessFallbackStatus = getNextHttpAccessFallbackStatus(flightPayloadText);
  if (accessFallbackStatus !== undefined) {
    await payloadStream.cancel();
    throw createNextHttpAccessFallbackError(accessFallbackStatus);
  }
  const redirectUrl = getNextRedirectUrlFromFlightPayloadText(flightPayloadText);
  if (redirectUrl) {
    await payloadStream.cancel();
    throw new NextAppRenderRedirectError(redirectUrl);
  }

  return ReactServer.createFromReadableStream<NextNavigationFlightPayload>(payloadStream);
}

export async function renderNextRouteActionResponse({
  loaderTree,
  route,
  page,
  url,
  actionId,
  reply,
  routerState,
  nextUrl,
  blockRedirectFlight,
  stubMetadata,
}: {
  loaderTree: LoaderTree;
  route: string;
  page: string;
  url: string;
  actionId: string;
  reply: string | FormData;
  routerState?: string | null;
  nextUrl?: string | null;
  blockRedirectFlight?: boolean;
  stubMetadata?: boolean;
}): Promise<Response> {
  const action = await loadNextServerAction(actionId);
  const location = new URL(url, "http://localhost");
  const requestHeaders = new Headers();
  requestHeaders.set(ACTION_HEADER, actionId);
  requestHeaders.set("origin", location.origin);
  requestHeaders.set("x-forwarded-host", location.host);
  if (typeof reply === "string") {
    requestHeaders.set("content-type", "text/plain;charset=UTF-8");
  }
  if (routerState) {
    requestHeaders.set(NEXT_ROUTER_STATE_TREE_HEADER, routerState);
  }
  if (nextUrl) {
    requestHeaders.set(NEXT_URL, nextUrl);
  }

  const manifests = {
    page,
    clientReferenceManifest: emptyClientReferenceManifest,
    serverActionsManifest: action
      ? createNextServerActionManifest(actionId, page)
      : emptyServerActionsManifest,
  } satisfies NextRenderManifests;
  await setNextRenderManifests(manifests);

  const componentMod = await createNextActionComponentMod(action, { stubMetadata });

  return withBlockedRedirectFlightFetch(blockRedirectFlight, async () => {
    const response = await renderNextRouteResult({
      loaderTree,
      route,
      page,
      location,
      request: createAppRenderRequest(location.href, {
        method: "POST",
        headers: requestHeaders,
        body: reply,
      }),
      componentMod,
      manifests,
    });

    if (blockRedirectFlight && response.headers.has("x-action-redirect")) {
      const headers = new Headers(response.headers);
      headers.delete("content-type");
      return new Response(null, {
        status: response.status,
        headers,
      });
    }

    return response;
  });
}

async function renderNextRouteResult({
  loaderTree,
  route,
  page,
  location,
  request,
  componentMod,
  manifests,
}: {
  loaderTree: LoaderTree;
  route: string;
  page: string;
  location: URL;
  request: Request;
  componentMod?: NextEntryBaseComponentMod;
  manifests: NextRenderManifests;
}) {
  await ensureNextAppRenderGlobals();
  const req = new WebNextRequest(request as never);
  const res = new WebNextResponse();
  const renderPage = normalizeAppPath(page);
  const routeModule = createAppPageRouteModule({
    route,
    page,
    loaderTree,
  });
  const lifecycle = createRequestLifecycle();
  const entryBaseComponentMod = (componentMod ??
    (await import("next/dist/server/app-render/entry-base.js"))) as NextEntryBaseComponentMod;
  const globalErrorComponent =
    entryBaseComponentMod.GlobalError ?? (await loadGlobalErrorComponent(loaderTree));
  const resolvedComponentMod = {
    ...(entryBaseComponentMod as object),
    GlobalError: globalErrorComponent ?? DefaultGlobalError,
    renderToReadableStream: renderToReadableStreamWithViteRsc,
    routeModule,
  } as unknown as NextAppRenderComponentMod;
  const renderOpts = {
    ...createNextRenderOpts(manifests, lifecycle),
    ComponentMod: resolvedComponentMod,
    routeModule,
    page: renderPage,
    params: createRouteParams(route, location.pathname),
  };

  addRequestMeta(req, "resolvedPathname", location.pathname);

  const result = (await renderToHTMLOrFlight(
    req,
    res,
    renderPage,
    Object.fromEntries(location.searchParams),
    null,
    renderOpts as never,
    undefined,
    {
      buildId: "",
      deploymentId: "",
      clientAssetToken: "",
    },
  )) as RenderResult;

  const headers = createResponseHeaders(res, result);
  return new Response(
    closeStreamOnCompletion(
      (result as unknown as { readable: ReadableStream<Uint8Array> }).readable,
      lifecycle.close,
    ),
    {
      status: result.metadata.statusCode ?? res.statusCode ?? 200,
      headers,
    },
  );
}

function createAppRenderRequest(url: string, init: RequestInit): Request {
  const headers = new Headers(init.headers);
  const request = new Request(url, init);
  if (!headers.has("cookie")) return request;

  return new Proxy(request, {
    get(target, property) {
      if (property === "headers") return headers;
      if (property === "clone") {
        return () => createAppRenderRequest(target.url, { ...init, headers });
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export async function resetNextAppRenderCache(): Promise<void> {
  const patchedFetch = globalThis.fetch as typeof fetch & {
    __nextPatched?: true;
    _nextOriginalFetch?: typeof fetch;
  };

  if (patchedFetch.__nextPatched && patchedFetch._nextOriginalFetch) {
    globalThis.fetch = patchedFetch._nextOriginalFetch;
  }
  (globalThis as Record<symbol, unknown>)[NEXT_PATCH_SYMBOL] = false;

  const globalScope = globalThis as typeof globalThis & {
    __incrementalCache?: unknown;
    __incrementalCacheShared?: boolean;
  };

  tagsManifest.clear();
  globalScope.__incrementalCache = undefined;
  globalScope.__incrementalCacheShared = undefined;
  nextCacheGeneration += 1;
  NextIncrementalCache = IncrementalCache;
  nextCacheHandlersPromise = undefined;
  resetNextCacheHandlerGlobals();
}

async function loadNextServerAction(id: string) {
  try {
    return await ReactServer.loadServerAction(id);
  } catch (error) {
    console.warn(error);
    return;
  }
}

async function withBlockedRedirectFlightFetch<T>(
  blockRedirectFlight: boolean | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  if (!blockRedirectFlight) return callback();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const request = new Request(input, init);
    if (
      request.method === "GET" &&
      request.headers.has(RSC_HEADER) &&
      !request.headers.has(ACTION_HEADER)
    ) {
      return new Response(null, { status: 204 });
    }

    return originalFetch(request);
  }) as typeof fetch;

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export async function createNextDirectComponentMod(): Promise<NextEntryBaseComponentMod> {
  return {
    ...((await import("next/dist/server/app-render/entry-base.js")) as object),
    createMetadataComponents: createEmptyMetadataComponents,
  } as unknown as NextEntryBaseComponentMod;
}

export async function createNextActionComponentMod(
  action: Function | undefined,
  options: { stubMetadata?: boolean } = {},
) {
  return {
    ...((await import("next/dist/server/app-render/entry-base.js")) as object),
    ...(options.stubMetadata ? { createMetadataComponents: createEmptyMetadataComponents } : {}),
    renderToReadableStream: renderToReadableStreamWithViteRsc,
    createTemporaryReferenceSet: ReactServer.createTemporaryReferenceSet,
    decodeReply: (
      body: string | FormData,
      _serverModuleMap: unknown,
      options?: { temporaryReferences?: unknown },
    ) => ReactServer.decodeReply(body, options as never),
    __next_app__: {
      require: async (id: string | number) => ({
        [String(id)]: action ?? (await ReactServer.loadServerAction(String(id))),
      }),
    },
  } as unknown as typeof import("next/dist/server/app-render/entry-base.js") & {
    __next_app__: { require: (id: string | number) => Promise<Record<string, Function>> };
  };
}

function createEmptyMetadataComponents() {
  return {
    Viewport: EmptyMetadataBoundary,
    Metadata: EmptyMetadataBoundary,
    MetadataOutlet: EmptyMetadataBoundary,
  };
}

function EmptyMetadataBoundary() {
  return null;
}

function renderToReadableStreamWithViteRsc<T>(
  payload: T,
  _clientModules: unknown,
  options?: Parameters<typeof ReactServer.renderToReadableStream>[1],
) {
  return ReactServer.renderToReadableStream(payload, options);
}

type NextAppRenderComponentMod = typeof import("next/dist/server/app-render/entry-base.js") & {
  routeModule: ReturnType<typeof createAppPageRouteModule>;
};

type NextEntryBaseComponentMod = typeof import("next/dist/server/app-render/entry-base.js") &
  Record<string, unknown>;

type LoaderTreeModule = [() => Promise<Record<string, unknown>>, string];

async function loadGlobalErrorComponent(loaderTree: LoaderTree): Promise<unknown> {
  const globalErrorModule = findLoaderTreeModule(loaderTree, "global-error");
  if (!globalErrorModule) return;

  const mod = await globalErrorModule[0]();
  return interopDefault(mod);
}

function findLoaderTreeModule(
  loaderTree: LoaderTree,
  moduleName: string,
): LoaderTreeModule | undefined {
  const [, parallelRoutes, modules] = loaderTree as unknown as [
    unknown,
    Record<string, LoaderTree>,
    Record<string, LoaderTreeModule | undefined>,
  ];
  const moduleEntry = modules[moduleName];
  if (moduleEntry) return moduleEntry;

  for (const childTree of Object.values(parallelRoutes)) {
    const childModule = findLoaderTreeModule(childTree, moduleName);
    if (childModule) return childModule;
  }
}

function interopDefault(mod: Record<string, unknown>) {
  return mod.default ?? mod;
}

function DefaultGlobalError() {
  return null;
}

async function ensureNextAppRenderGlobals() {
  const globalScope = globalThis as typeof globalThis & {
    Buffer?: typeof Buffer;
    process?: NodeJS.Process;
  };

  globalScope.Buffer ??= Buffer;
  patchBufferIndexOfUint8ArrayNeedle(globalScope.Buffer);
  globalScope.process ??= { env: {} } as NodeJS.Process;
  globalScope.process.env ??= {};
  globalScope.process.env["NEXT_RUNTIME"] ??= "edge";
  NextIncrementalCache = IncrementalCache;
  nextCacheHandlersPromise ??= initializeNextCacheHandlers();
  await nextCacheHandlersPromise;
  ensureNextEdgeIncrementalCache(IncrementalCache, nextCacheGeneration);
}

async function initializeNextCacheHandlers() {
  const cacheMaxMemorySize = readNextDefineNumber(
    process.env.__NEXT_CACHE_MAX_MEMORY_SIZE,
    defaultConfig.cacheMaxMemorySize ?? 50 * 1024 * 1024,
  );
  initializeCacheHandlers(cacheMaxMemorySize);

  const cacheHandlers = readNextDefineObject(process.env.__NEXT_CACHE_HANDLERS);
  if (!cacheHandlers) return;

  const { nextCacheHandlers } = await import("virtual:vitest-plugin-rsc/next-cache-handlers");

  for (const [kind, handler] of Object.entries(cacheHandlers)) {
    if (typeof handler !== "string" || handler.length === 0) continue;

    const cacheHandler = nextCacheHandlers[kind];
    if (cacheHandler) setCacheHandler(kind, cacheHandler as CacheHandler);
  }
}

function createRequestLifecycle(): RequestLifecycle {
  const closeCallbacks = new Set<() => void>();
  const waitUntilPromises = new Set<Promise<unknown>>();
  let closed = false;

  const lifecycle: RequestLifecycle = {
    waitUntil(promise) {
      let tracked: Promise<unknown>;
      tracked = Promise.resolve(promise)
        .catch((error) => lifecycle.onAfterTaskError(error))
        .finally(() => waitUntilPromises.delete(tracked));
      waitUntilPromises.add(tracked);
    },
    onClose(callback) {
      const runInSnapshot = createSnapshot();
      const boundCallback = () => {
        void runInSnapshot(() => {
          callback();
          // The browser AsyncLocalStorage shim intentionally does not patch
          // Promise continuations. Next's AfterContext resumes from
          // `onClose(resolve)`, so keep the captured work store alive through
          // that first continuation.
          return Promise.resolve();
        });
      };
      if (closed) {
        boundCallback();
        return;
      }

      closeCallbacks.add(boundCallback);
    },
    onAfterTaskError(error) {
      console.error(error);
    },
    async close() {
      if (closed) return;

      closed = true;
      const callbacks = Array.from(closeCallbacks);
      closeCallbacks.clear();
      for (const callback of callbacks) {
        callback();
      }
      while (waitUntilPromises.size > 0) {
        await Promise.allSettled(waitUntilPromises);
      }
    },
  };

  return lifecycle;
}

function closeStreamOnCompletion<T>(readable: ReadableStream<T>, close: () => Promise<void>) {
  const reader = readable.getReader();

  return new ReadableStream<T>({
    async pull(controller) {
      const result = await reader.read();
      if (result.done) {
        await close();
        controller.close();
        return;
      }

      controller.enqueue(result.value);
    },
    async cancel(reason) {
      try {
        await close();
      } finally {
        await reader.cancel(reason);
      }
    },
  });
}

function resetNextCacheHandlerGlobals() {
  const globalScope = globalThis as Record<symbol, unknown>;
  delete globalScope[Symbol.for("@next/cache-handlers-map")];
  delete globalScope[Symbol.for("@next/cache-handlers-set")];
}

async function readReadableStreamText(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return text + decoder.decode();
}

function createRouteParams(routePattern: string, pathname: string) {
  return (getRouteMatcher(getRouteRegex(normalizeRoutePattern(routePattern)))(pathname) ||
    {}) as Record<string, string | string[]>;
}

function normalizeRoutePattern(routePattern: string) {
  const withLeadingSlash = routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
  const withoutTrailingSlash = withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/$/, "");
  return normalizeAppPath(`${withoutTrailingSlash}/page`);
}

export function createResponseHeaders(res: WebNextResponse, result: RenderResult) {
  const headers = new Headers((res as unknown as { headers: Headers }).headers);
  const metadataHeaders = result.metadata.headers;
  if (metadataHeaders) {
    for (const [key, value] of Object.entries(metadataHeaders)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.delete(key);
        for (const item of value) {
          headers.append(key, item);
        }
      }
    }
  }
  headers.set("content-type", result.contentType ?? RSC_CONTENT_TYPE_HEADER);
  return headers;
}
