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
import type { RenderOpts } from "next/dist/server/app-render/types.js";
import { defaultConfig } from "next/dist/server/config-shared.js";
import { createSnapshot } from "next/dist/server/app-render/async-local-storage.js";
import { IncrementalCache } from "next/dist/server/lib/incremental-cache/index.js";
import { tagsManifest } from "next/dist/server/lib/incremental-cache/tags-manifest.external.js";
import { NEXT_PATCH_SYMBOL } from "next/dist/server/lib/patch-fetch.js";
import { addRequestMeta } from "next/dist/server/request-meta.js";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import type RenderResult from "next/dist/server/render-result.js";
import type { InitialRSCPayload } from "next/dist/shared/lib/app-router-types";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths.js";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher.js";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";

type NextIncrementalCacheConstructor =
  typeof import("next/dist/server/lib/incremental-cache/index.js").IncrementalCache;

export type NextInitialRscPayload = InitialRSCPayload;
export type NextNavigationFlightPayload = Partial<InitialRSCPayload> & Pick<InitialRSCPayload, "f">;

type NextRenderManifests = {
  page: string;
  clientReferenceManifest: unknown;
  serverActionsManifest: unknown;
};

const emptyBuildManifest = {
  devFiles: [],
  polyfillFiles: [],
  lowPriorityFiles: [],
  rootMainFiles: ["static/chunks/vitest-plugin-rsc-next-bootstrap.js"],
  rootMainFilesTree: {},
  pages: {
    "/_app": [],
  },
};

let NextIncrementalCache: NextIncrementalCacheConstructor | undefined;
let nextCacheGeneration = 0;
const patchedBufferIndexOfSymbol = Symbol.for("vitest-plugin-rsc.nextjs.patchedBufferIndexOf");

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
    throw new Error(`NEXT_HTTP_ERROR_FALLBACK;${response.status}`);
  }

  if (!response.body) {
    throw new Error("Next app-render did not return an RSC response body.");
  }

  const [inspectionStream, payloadStream] = response.body.tee();
  const flightPayloadText = await readReadableStreamText(inspectionStream);
  if (isNextDocumentFallbackPayloadText(flightPayloadText)) {
    await payloadStream.cancel();
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
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
  ensureNextAppRenderGlobals();
  const req = new WebNextRequest(request as never);
  const res = new WebNextResponse();
  const renderPage = normalizeAppPath(page);
  const routeModule = createRouteModule({
    route,
    page,
    loaderTree,
  });
  const lifecycle = createRequestLifecycle();
  const resolvedComponentMod = {
    ...((componentMod ?? (await import("next/dist/server/app-render/entry-base.js"))) as object),
    renderToReadableStream: renderToReadableStreamWithViteRsc,
    routeModule,
  } as NextAppRenderComponentMod;
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
  routeModule: ReturnType<typeof createRouteModule>;
};

type NextEntryBaseComponentMod = typeof import("next/dist/server/app-render/entry-base.js") &
  Record<string, unknown>;

function createRouteModule({
  route,
  page,
  loaderTree,
}: {
  route: string;
  page: string;
  loaderTree: LoaderTree;
}) {
  // Begin copy: Next.js AppPageRouteModule definition shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/templates/app-page.ts#L118-L150
  // Adaptation: Vitest creates the route module object directly because Vite
  // already loaded the app tree through virtual modules.
  return {
    definition: {
      kind: "APP_PAGE",
      page,
      pathname: route,
      bundlePath: "",
      filename: "",
      appPaths: [page],
    },
    userland: {
      loaderTree,
    },
  };
  // End copy
}

function ensureNextAppRenderGlobals() {
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
  ensureNextEdgeIncrementalCache(IncrementalCache);
}

function patchBufferIndexOfUint8ArrayNeedle(BufferCtor: typeof Buffer) {
  const prototype = BufferCtor.prototype as Buffer & {
    [patchedBufferIndexOfSymbol]?: true;
  };
  if (prototype[patchedBufferIndexOfSymbol]) return;

  type BufferIndexOfImplementation = (
    this: Buffer,
    value: string | number | Uint8Array,
    byteOffset?: number | BufferEncoding,
    encoding?: BufferEncoding,
  ) => number;

  const originalIndexOf = prototype.indexOf as BufferIndexOfImplementation;
  const patchedIndexOf: BufferIndexOfImplementation = function patchedIndexOf(
    value,
    byteOffset,
    encoding,
  ) {
    const normalizedValue =
      value instanceof Uint8Array && !BufferCtor.isBuffer(value)
        ? BufferCtor.from(value.buffer, value.byteOffset, value.byteLength)
        : value;
    return originalIndexOf.call(this, normalizedValue, byteOffset, encoding);
  };
  Object.defineProperty(prototype, "indexOf", {
    configurable: true,
    writable: true,
    value: patchedIndexOf,
  });
  prototype[patchedBufferIndexOfSymbol] = true;
}

type RequestLifecycle = {
  waitUntil(promise: Promise<unknown>): void;
  onClose(callback: () => void): void;
  onAfterTaskError(error: unknown): void;
  close(): Promise<void>;
};

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

function createNextRenderOpts(
  manifests: NextRenderManifests,
  lifecycle: RequestLifecycle,
): RenderOpts {
  // Begin copy: Next.js app-render RenderOpts fields used by app-render
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/types.ts
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/base-server.ts#L2522-L2570
  // Adaptation: component tests provide the minimum dynamic render options
  // needed by Next app-render without starting a Next server.
  return {
    basePath: readNextDefineString(process.env.__NEXT_BASE_PATH, defaultConfig.basePath),
    supportsDynamicResponse: true,
    buildManifest: emptyBuildManifest,
    crossOrigin: undefined,
    clientReferenceManifest: manifests.clientReferenceManifest,
    serverActionsManifest: manifests.serverActionsManifest,
    subresourceIntegrityManifest: undefined,
    images: {
      ...defaultConfig.images,
      ...readNextDefineObject(process.env.__NEXT_IMAGE_OPTS),
    },
    trailingSlash: isNextDefineFlagEnabled(process.env.__NEXT_TRAILING_SLASH),
    assetPrefix: readNextDefineString(process.env.__NEXT_ASSET_PREFIX, defaultConfig.assetPrefix),
    cacheComponents: isNextDefineFlagEnabled(process.env.__NEXT_CACHE_COMPONENTS),
    cacheLifeProfiles:
      readNextDefineObject(process.env.__NEXT_CACHE_LIFE) ?? defaultConfig.cacheLife,
    experimental: {
      isRoutePPREnabled: false,
      authInterrupts: isNextDefineFlagEnabled(process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS),
    },
    waitUntil: lifecycle.waitUntil,
    onClose: lifecycle.onClose,
    onAfterTaskError: lifecycle.onAfterTaskError,
  } as unknown as RenderOpts;
  // End copy
}

function isNextDefineFlagEnabled(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function readNextDefineString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function readNextDefineObject(value: unknown): Record<string, unknown> | undefined {
  if (!value) return;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return;

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return;
  }
}

async function setNextRenderManifests(manifests: NextRenderManifests): Promise<void> {
  const modern = await importModernManifestsSingleton();
  if (modern?.setManifestsSingleton) {
    modern.setManifestsSingleton(manifests);
    return;
  }

  const legacy = await importLegacyManifestsSingleton();
  if (!legacy?.setReferenceManifestsSingleton) return;

  const actionUtils = await importLegacyActionUtils();
  legacy.setReferenceManifestsSingleton({
    ...manifests,
    serverModuleMap: actionUtils?.createServerModuleMap?.({
      serverActionsManifest: manifests.serverActionsManifest,
    }),
  });
}

async function importModernManifestsSingleton(): Promise<
  | {
      setManifestsSingleton?: (manifests: NextRenderManifests) => void;
    }
  | undefined
> {
  try {
    return (await import("next/dist/server/app-render/manifests-singleton.js")) as {
      setManifestsSingleton?: (manifests: NextRenderManifests) => void;
    };
  } catch {
    return undefined;
  }
}

async function importLegacyManifestsSingleton(): Promise<
  | {
      setReferenceManifestsSingleton?: (
        manifests: NextRenderManifests & { serverModuleMap?: unknown },
      ) => void;
    }
  | undefined
> {
  try {
    return (await import("next/dist/server/app-render/encryption-utils.js")) as {
      setReferenceManifestsSingleton?: (
        manifests: NextRenderManifests & { serverModuleMap?: unknown },
      ) => void;
    };
  } catch {
    return undefined;
  }
}

async function importLegacyActionUtils(): Promise<
  | {
      createServerModuleMap?: (options: { serverActionsManifest: unknown }) => unknown;
    }
  | undefined
> {
  try {
    // @ts-ignore - this was a Next 16.0 internal and is not present in newer versions.
    return (await import("next/dist/server/app-render/action-utils.js")) as {
      createServerModuleMap?: (options: { serverActionsManifest: unknown }) => unknown;
    };
  } catch {
    return undefined;
  }
}

// Begin copy: Next.js client/server action manifest shapes
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack/plugins/flight-manifest-plugin.ts
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack/plugins/flight-client-entry-plugin.ts
// Adaptation: Vite RSC owns client references and action module loading, so
// these manifests are minimal lookup shims for Next app-render.
const emptyClientReferenceManifest = {
  moduleLoading: { prefix: "", crossOrigin: null },
  clientModules: createViteRscClientModulesProxy(),
  rscModuleMapping: {},
  edgeRscModuleMapping: {},
  ssrModuleMapping: {},
  edgeSSRModuleMapping: {},
  entryCSSFiles: {},
  entryJSFiles: {},
} as never;

const htmlClientReferenceManifest = {
  moduleLoading: { prefix: "", crossOrigin: null },
  clientModules: createViteRscClientModulesProxy(),
  rscModuleMapping: createViteRscModuleMappingProxy(),
  edgeRscModuleMapping: createViteRscModuleMappingProxy(),
  ssrModuleMapping: createViteRscModuleMappingProxy(),
  edgeSSRModuleMapping: createViteRscModuleMappingProxy(),
  entryCSSFiles: {},
  entryJSFiles: {},
} as never;

function createViteRscClientModulesProxy() {
  return new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== "string") return;

        const [id, name] = key.split("#");
        if (!id || !name) return;

        return {
          id: normalizeViteRscManifestModuleId(id),
          name,
          chunks: [],
          async: true,
        };
      },
    },
  );
}

function createViteRscModuleMappingProxy() {
  return new Proxy(
    {},
    {
      get(_target, id) {
        if (typeof id !== "string") return;
        return createViteRscModuleExportsProxy(id);
      },
    },
  );
}

function createViteRscModuleExportsProxy(id: string) {
  return new Proxy(
    {},
    {
      get(_target, name) {
        if (typeof name !== "string") return;
        return {
          id: normalizeViteRscManifestModuleId(id),
          name,
          chunks: [],
          async: true,
        };
      },
    },
  );
}

function normalizeViteRscManifestModuleId(id: string) {
  const withoutCacheTag = id.split("$$cache=")[0]!;
  if (isNextBuiltinGlobalErrorModuleId(withoutCacheTag)) {
    return "/@id/__x00__virtual:vitest-plugin-rsc/next-builtin-global-error-stub";
  }
  return withoutCacheTag;
}

function isNextBuiltinGlobalErrorModuleId(id: string) {
  return (
    id.includes("next_dist_client_components_builtin_global-error") ||
    id.includes("next/dist/client/components/builtin/global-error")
  );
}

function isNextDocumentFallbackPayloadText(text: string) {
  return text.includes('"digest":"NEXT_HTTP_ERROR_FALLBACK;404"');
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

const emptyServerActionsManifest = {
  encryptionKey: "",
  node: {},
  edge: {},
} as never;

function createNextServerActionManifest(actionId: string, page: string) {
  const [filename, exportedName] = actionId.split("#");
  const worker = {
    moduleId: actionId,
    async: true as const,
  };
  const actionEntry = {
    exportedName,
    filename,
    workers: createServerActionWorkers(page, worker),
  };

  return {
    encryptionKey: "",
    node: {
      [actionId]: actionEntry,
    },
    edge: {
      [actionId]: actionEntry,
    },
  } as never;
}

function createServerActionWorkers(
  page: string,
  worker: {
    moduleId: string;
    async: true;
  },
) {
  const workerPage = page.startsWith("app") ? page : `app${page}`;
  const routeWorkerPage = workerPage.replace(/\/(?:page|route)$/, "");

  return new Proxy(
    {
      [workerPage]: worker,
      [routeWorkerPage]: worker,
    },
    {
      get(target, key) {
        if (typeof key !== "string") {
          return Reflect.get(target, key);
        }
        return Reflect.get(target, key) ?? worker;
      },
    },
  );
}
// End copy

function createRouteParams(routePattern: string, pathname: string) {
  return (getRouteMatcher(getRouteRegex(normalizeRoutePattern(routePattern)))(pathname) ||
    {}) as Record<string, string | string[]>;
}

function normalizeRoutePattern(routePattern: string) {
  const withLeadingSlash = routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
  const withoutTrailingSlash = withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/$/, "");
  return normalizeAppPath(`${withoutTrailingSlash}/page`);
}

function ensureNextEdgeIncrementalCache(IncrementalCache: NextIncrementalCacheConstructor) {
  const globalScope = globalThis as typeof globalThis & {
    __incrementalCache?: unknown;
    __incrementalCacheShared?: boolean;
  };

  if (globalScope.__incrementalCache) return;

  // Begin copy: Next.js Edge incremental cache global shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/web/adapter.ts#L217-L235
  // Adaptation: Vitest browser workers do not run Next's web adapter, but
  // imported Next cache internals still read the same global.
  globalScope.__incrementalCacheShared = true;
  globalScope.__incrementalCache = createNextEdgeIncrementalCache(IncrementalCache);
  // End copy
}

function createNextEdgeIncrementalCache(
  IncrementalCache: NextIncrementalCacheConstructor | undefined = NextIncrementalCache,
) {
  if (!IncrementalCache) {
    throw new Error("Invariant: Next IncrementalCache was not loaded.");
  }

  return new IncrementalCache({
    fs: {} as never,
    dev: false,
    requestHeaders: {},
    minimalMode: true,
    fetchCacheKeyPrefix: `vitest-plugin-rsc-${nextCacheGeneration}`,
    serverDistDir: "/",
    maxMemoryCacheSize: 50 * 1024 * 1024,
    flushToDisk: false,
    getPrerenderManifest: () => ({
      version: 4,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: {
        previewModeId: "vitest-plugin-rsc",
        previewModeSigningKey: "vitest-plugin-rsc",
        previewModeEncryptionKey: "vitest-plugin-rsc",
      },
    }),
  });
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
