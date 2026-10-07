import { RSC_HEADER } from "next/dist/client/components/app-router-headers";
import { RedirectStatusCode } from "next/dist/client/components/redirect-status-code";
import { NEXT_CACHE_TAGS_HEADER } from "next/dist/lib/constants";
import { NodeNextRequest, NodeNextResponse } from "next/dist/server/base-http/node";
import { isRSCRequestHeader } from "next/dist/server/lib/is-rsc-request";
import { setRequestMeta } from "next/dist/server/request-meta";
import { sendRenderResult } from "next/dist/server/send-payload";
import { getIsPossibleServerAction } from "next/dist/server/lib/server-action-request-meta";
import { shouldServeStreamingMetadata } from "next/dist/server/lib/streaming-metadata";
import { createDevRenderContext } from "next/dist/server/route-modules/app-page/dev-render-context";
import { parseRequestHeaders } from "next/dist/server/route-modules/app-page/parse-request-headers";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths";
import { getBotType } from "next/dist/shared/lib/router/utils/is-bot";
import { parseMaxPostponedStateSize } from "next/dist/shared/lib/size-limit";
import { nextConfig } from "virtual:vitest-plugin-rsc/next-manifest";
import { Readable } from "virtual:vitest-plugin-rsc/node-stream";
import { preview } from "./cache.ts";
import { registry, type RouteHandler, type ServerRequest } from "./registry.ts";

// Next's server runs here as it does on Node.js, its default runtime. (Its
// edge runtime, which is closer to a tab, is deprecated.) The renderer takes
// the branches of `process.env.NEXT_RUNTIME === "nodejs"`, with web streams:
// `__NEXT_USE_NODE_STREAMS` is off. This file is what a Node.js server has
// around a request and a tab does not:
//   - `http.IncomingMessage` and `http.ServerResponse`.
//   - The manifests of a build, which Next reads from `.next/`: given here,
//     through `load-manifest.external`, the module Next keeps out of its own
//     bundle for it.
// The Node modules that Next's server imports are in plugin.ts, and its
// globals in globals.ts.

export const anyKey = <T>(create: (key: string) => T) =>
  new Proxy({} as Record<string, T>, {
    get: (_, key) => (typeof key === "string" ? create(key) : undefined),
    has: () => true,
  });

// Next's build writes a manifest of every client reference. For Vite RSC a
// reference is its module id, so this one answers for any id.
const clientReference = anyKey((id) => anyKey((name) => ({ id, name, chunks: [], async: true })));
export const clientReferenceManifest = {
  moduleLoading: { prefix: "", crossOrigin: null },
  clientModules: anyKey((id) => ({ id, name: "*", chunks: [], async: true })),
  ssrModuleMapping: clientReference,
  rscModuleMapping: clientReference,
  entryCSSFiles: anyKey(() => []),
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
  [
    "routes-manifest.json",
    () => ({
      version: 4,
      caseSensitive: false,
      basePath: nextConfig.basePath ?? "",
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
      redirects: [],
      headers: [],
      onMatchHeaders: [],
    }),
  ],
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
  ["server-reference-manifest.json", () => ({ node: {}, edge: {}, encryptionKey: "" })],
  ["required-server-files.json", () => ({ config: nextConfig })],
  ["BUILD_ID", () => process.env.__NEXT_BUILD_ID ?? "vitest"],
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

type Listener = (...args: unknown[]) => void;

// A test's own timers may be fake.
const nativeSetTimeout = globalThis.setTimeout;

/** As much of an `http.IncomingMessage` as Next's server reads. */
function createNodeRequest(request: ServerRequest) {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => (headers[name] = value));
  headers.host ??= url.host;

  const incoming = new Readable({ read() {} });
  Object.assign(incoming, {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    httpVersion: "1.1",
    socket: { encrypted: url.protocol === "https:" },
  });

  const { body } = request;
  if (body instanceof Uint8Array) {
    incoming.push(body);
    incoming.push(null);
  } else if (body) {
    const reader = body.getReader();
    const pump = (): Promise<void> =>
      reader.read().then(({ done, value }) => {
        if (done) return void incoming.push(null);
        incoming.push(value);
        return pump();
      });
    pump().catch((error) => incoming.destroy(error));
  } else {
    incoming.push(null);
  }
  return incoming as typeof incoming & { headers: Record<string, string>; method: string };
}

/** As much of an `http.ServerResponse` as Next's server writes to. */
function createNodeResponse() {
  const headers = new Map<string, number | string | string[]>();
  const listeners = new Map<string, Set<Listener>>();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (c) => void (controller = c),
    // Whoever reads the response has left, like a browser that leaves a page.
    cancel: () => response.destroy(),
  });
  let wrote = false;
  let sendHead!: () => void;
  // Resolves when the status and the headers are final: at the first byte.
  const head = new Promise<void>((resolve) => (sendHead = resolve));
  const encoder = new TextEncoder();

  const response = {
    statusCode: 200,
    statusMessage: "",
    finished: false,
    headersSent: false,
    writableEnded: false,
    writableFinished: false,
    errored: null,
    destroyed: false,
    setHeader(name: string, value: number | string | string[]) {
      headers.set(name.toLowerCase(), value);
      return response;
    },
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    hasHeader: (name: string) => headers.has(name.toLowerCase()),
    getHeaders: () => Object.fromEntries(headers),
    getHeaderNames: () => [...headers.keys()],
    removeHeader: (name: string) => void headers.delete(name.toLowerCase()),
    on(event: string, listener: Listener) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(listener);
      return response;
    },
    once: (event: string, listener: Listener) => response.on(event, listener),
    off(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
      return response;
    },
    emit(event: string, ...args: unknown[]) {
      const set = listeners.get(event);
      listeners.delete(event);
      for (const listener of set ?? []) listener(...args);
    },
    flushHeaders() {
      response.headersSent = true;
      sendHead();
    },
    write(chunk: string | Uint8Array) {
      if (response.destroyed || response.writableEnded) return false;
      response.flushHeaders();
      wrote = true;
      controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : new Uint8Array(chunk));
      return true;
    },
    end(chunk?: string | Uint8Array | null) {
      if (response.destroyed || response.writableEnded) return;
      if (chunk !== undefined && chunk !== null) response.write(chunk);
      response.flushHeaders();
      // All of it went out: Next takes a `close` before that for a client
      // that left, and aborts the signal of the request.
      response.writableEnded = response.writableFinished = response.finished = true;
      controller.close();
      response.emit("finish");
      // A socket closes after the response has gone out: what Next runs then,
      // like `after()`, comes after whoever asked has its answer.
      nativeSetTimeout(() => response.emit("close"));
    },
    /** Ends the response before all of it went out. Without an error, the reader left. */
    destroy(error?: unknown) {
      if (response.destroyed || response.writableEnded) return;
      response.destroyed = true;
      sendHead();
      // A reader that left has cancelled the body already.
      if (error !== undefined) controller.error(error);
      response.emit("close");
    },
    /** The response as the tab gets it, once its head is there. */
    async toResponse(headersOf: (headers: Record<string, unknown>) => Headers): Promise<Response> {
      await head;
      const status = response.statusCode;
      // A status without a body, and an `end()` without a byte before it.
      const empty = (response.finished && !wrote) || [101, 204, 205, 304].includes(status);
      return new registry.Response(empty ? null : body, {
        status,
        statusText: response.statusMessage,
        headers: headersOf(response.getHeaders()),
      });
    },
  };
  return response;
}

function toHeaders(values: Record<string, unknown>, init?: HeadersInit): Headers {
  const headers = new Headers(init);
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      headers.delete(name);
      for (const item of value) headers.append(name, String(item));
    } else {
      headers.set(name, String(value));
    }
  }
  return headers;
}

type NodeResponse = ReturnType<typeof createNodeResponse>;

// The response of the server once its head is there, while `written` goes on
// to write the body. What fails before that is the failure of the request;
// after it, the body ends with the error.
function respond(res: NodeResponse, written: Promise<unknown>): Promise<Response> {
  const failed = new Promise<never>((_, reject) =>
    written.catch((error) => (res.headersSent ? res.destroy(error ?? new Error()) : reject(error))),
  );
  return Promise.race([res.toResponse(toHeaders), failed]);
}

// What `next start` knows of a request before a route gets it: the URL the
// browser asked for. Without it Next takes the server to be `localhost`.
function requestMetaOf(request: ServerRequest) {
  return { initURL: request.url, initProtocol: new URL(request.url).protocol.slice(0, -1) };
}

/**
 * One request for a route handler, by the request handler Next's build makes
 * for it: `templates/app-route`, as `next start` calls it.
 */
export async function handleRouteHandler(
  request: ServerRequest,
  context: { waitUntil?: (promise: Promise<unknown>) => void },
  handler: RouteHandler,
): Promise<Response> {
  const req = createNodeRequest(request);
  const res = createNodeResponse();
  request.signal?.addEventListener("abort", () => res.destroy(), { once: true });
  // The cache of the server: see cache.ts. Next's route module makes one of
  // its own when it stores a response, and leaves it in this global.
  const cache = globalThis.__incrementalCache;
  const handled = handler(req, res, {
    waitUntil: context.waitUntil,
    requestMeta: { ...requestMetaOf(request), incrementalCache: cache },
  }).finally(() => (globalThis.__incrementalCache = cache));
  return respond(res, handled);
}

type RenderResult = {
  metadata: { statusCode?: number; headers?: Record<string, unknown> };
};

/**
 * One request for a page, by Next's Node.js route module: `prepare()`, then
 * `render()`, as the request handler of `next start` calls them.
 *
 * Not that handler itself, `templates/app-page-runtime`: around these two
 * calls it has the response cache of prerendered pages, and nothing is
 * prerendered here.
 */
export async function handlePage(
  request: ServerRequest,
  context: { waitUntil?: (promise: Promise<unknown>) => void },
  page: string,
  entry: string,
): Promise<Response> {
  const ComponentMod = registry.appPages[entry] as {
    routeModule: {
      relativeProjectDir: string;
      prepare(req: unknown, res: unknown, options: object): Promise<any>;
      render(req: unknown, res: unknown, context: object): Promise<RenderResult>;
      onRequestError(...args: unknown[]): Promise<void>;
      getVaryHeader(pathname: string, patterns: RegExp[]): string;
    };
    default?: unknown;
  };
  const { routeModule } = ComponentMod;
  const req = createNodeRequest(request);
  const res = createNodeResponse();

  setRequestMeta(req as never, requestMetaOf(request) as never);
  const nextRes = new NodeNextResponse(res as never);
  const prepared = await routeModule.prepare(req, res, {
    srcPage: page,
    multiZoneDraftMode: false,
  });
  if (!prepared) return new registry.Response("Bad Request", { status: 400 });
  const {
    query,
    params,
    buildId,
    buildManifest,
    nextFontManifest,
    reactLoadableManifest,
    subresourceIntegrityManifest,
    previewProps,
    resolvedPathname,
    interceptionRoutePatterns,
    deploymentId,
    clientAssetToken,
    isDraftMode,
    isOnDemandRevalidate,
    routerServerContext,
  } = prepared;
  const config = nextConfig as Record<string, any>;
  res.setHeader("Vary", routeModule.getVaryHeader(resolvedPathname, interceptionRoutePatterns));
  const userAgent = req.headers["user-agent"] ?? "";

  const renderContext = {
    query,
    params,
    page: normalizeAppPath(page),
    routeMatch: { resolvedPathname },
    parsedRequestHeaders: parseRequestHeaders(req.headers, {
      isRoutePPREnabled: false,
      previewModeId: previewProps?.previewModeId,
    }),
    sharedContext: { buildId, deploymentId, clientAssetToken },
    dev: createDevRenderContext(req as never),
    fallbackRouteParams: null,
    renderOpts: {
      App: () => null,
      Document: () => null,
      pageConfig: {},
      ComponentMod,
      Component: ComponentMod.default ?? ComponentMod,
      params,
      routeModule,
      page,
      postponed: undefined,
      serveStreamingMetadata: shouldServeStreamingMetadata(userAgent, config.htmlLimitedBots),
      supportsDynamicResponse: true,
      buildManifest,
      nextFontManifest,
      reactLoadableManifest,
      subresourceIntegrityManifest,
      dir: "/",
      isDraftMode,
      botType: getBotType(userAgent),
      isOnDemandRevalidate,
      isPossibleServerAction: getIsPossibleServerAction(req as never),
      assetPrefix: config.assetPrefix,
      nextConfigOutput: config.output,
      crossOrigin: config.crossOrigin,
      trailingSlash: config.trailingSlash,
      images: config.images,
      previewProps,
      enableTainting: config.experimental.taint,
      reactMaxHeadersLength: config.reactMaxHeadersLength,
      multiZoneDraftMode: false,
      // The cache of the server: see cache.ts.
      incrementalCache: globalThis.__incrementalCache,
      cacheLifeProfiles: config.cacheLife,
      staticPageGenerationTimeout: config.staticPageGenerationTimeout,
      basePath: config.basePath,
      serverActions: config.experimental.serverActions,
      logServerFunctions: typeof config.logging === "object" && !!config.logging.serverFunctions,
      cacheComponents: Boolean(config.cacheComponents),
      validationLevel: config.experimental.instantInsights?.validationLevel,
      experimental: {
        isRoutePPREnabled: false,
        expireTime: config.expireTime,
        staleTimes: config.experimental.staleTimes,
        dynamicOnHover: Boolean(config.experimental.dynamicOnHover),
        optimisticRouting: Boolean(config.experimental.optimisticRouting),
        parallelRouteMetadata: Boolean(config.experimental.parallelRouteMetadata),
        inlineCss: Boolean(config.experimental.inlineCss),
        prefetchInlining: config.experimental.prefetchInlining ?? false,
        authInterrupts: Boolean(config.experimental.authInterrupts),
        reactBrowserBailout: Boolean(config.experimental.reactBrowserBailout),
        serverComponentsHmrCancellation: false,
        useCacheTimeout: config.experimental.useCacheTimeout,
        durableUseCacheEntries: Boolean(config.experimental.durableUseCacheEntries),
        cachedNavigations: config.experimental.cachedNavigations ?? false,
        clientTraceMetadata: config.experimental.clientTraceMetadata || [],
        clientParamParsingOrigins: config.experimental.clientParamParsingOrigins,
        maxPostponedStateSizeBytes: parseMaxPostponedStateSize(
          config.experimental.maxPostponedStateSize,
        ),
        disableResumeDataCacheCompression:
          config.experimental.disableResumeDataCacheCompression ?? false,
        exposeTestingApi: false,
      },
      waitUntil: context.waitUntil,
      onClose: (callback: Listener) => void res.on("close", callback),
      onAfterTaskError: () => {},
      onInstrumentationRequestError: (error: unknown, errorContext: unknown, silenceLog: unknown) =>
        routeModule.onRequestError(req, error, errorContext, silenceLog, routerServerContext),
    },
  };

  let result: RenderResult;
  try {
    result = await routeModule.render(
      new NodeNextRequest(req as never),
      nextRes as never,
      renderContext,
    );
  } catch (error) {
    // What Next was to run when the response closes, like `after()`.
    res.destroy();
    throw error;
  }

  // From here on as Next's request handler goes on after a render: the
  // headers and the status of the render, then Next's own `sendRenderResult`.
  const { metadata } = result;
  for (const [name, value] of Object.entries(metadata.headers ?? {})) {
    if (value === undefined || name === NEXT_CACHE_TAGS_HEADER) continue;
    for (const item of [value].flat()) nextRes.appendHeader(name, String(item));
  }
  if (metadata.statusCode) {
    // A redirect is in the payload of an RSC request, for Next's router.
    const isRscRequest = isRSCRequestHeader(req.headers[RSC_HEADER]);
    res.statusCode =
      isRscRequest && metadata.statusCode in RedirectStatusCode ? 200 : metadata.statusCode;
  }
  return respond(
    res,
    sendRenderResult({
      req: req as never,
      res: res as never,
      result: result as never,
      generateEtags: config.generateEtags,
      poweredByHeader: config.poweredByHeader,
      // Nothing is prerendered: every page is rendered for its request.
      cacheControl: { revalidate: 0, expire: undefined },
    }),
  );
}
