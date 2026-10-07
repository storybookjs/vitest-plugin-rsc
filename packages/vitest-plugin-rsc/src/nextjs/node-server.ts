import { NodeNextRequest, NodeNextResponse } from "next/dist/server/base-http/node";
import { getIsPossibleServerAction } from "next/dist/server/lib/server-action-request-meta";
import { shouldServeStreamingMetadata } from "next/dist/server/lib/streaming-metadata";
import { createDevRenderContext } from "next/dist/server/route-modules/app-page/dev-render-context";
import { parseRequestHeaders } from "next/dist/server/route-modules/app-page/parse-request-headers";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths";
import { getBotType } from "next/dist/shared/lib/router/utils/is-bot";
import { parseMaxPostponedStateSize } from "next/dist/shared/lib/size-limit";
import { nextConfig } from "virtual:vitest-plugin-rsc/next-manifest";
import { Readable } from "vitest-plugin-rsc/node-stream";
import { registry, type ServerRequest } from "./registry.ts";

// Spike: Next's Node.js server in the tab, in place of its edge runtime, which
// Next has deprecated. The renderer is the same one; it takes the branches of
// `process.env.NEXT_RUNTIME === "nodejs"`, with web streams
// (`__NEXT_USE_NODE_STREAMS` is off) and without Cache Components.
//
// What a Node.js server has and a tab does not, and where it comes from:
//   - `http.IncomingMessage` and `http.ServerResponse`: made here.
//   - The manifests of a build, which Next reads from `.next/`: given here,
//     through `load-manifest.external`, the module Next keeps out of its own
//     bundle for it.
//   - `node:stream` and busboy, for the body of a Server Action: the polyfill
//     Next ships, see the bridges in plugin.ts.

const anyKey = <T>(create: (key: string) => T) =>
  new Proxy({} as Record<string, T>, {
    get: (_, key) => (typeof key === "string" ? create(key) : undefined),
    has: () => true,
  });

const preview = {
  previewModeId: process.env.__NEXT_PREVIEW_MODE_ID ?? "",
  previewModeSigningKey: process.env.__NEXT_PREVIEW_MODE_SIGNING_KEY ?? "",
  previewModeEncryptionKey: process.env.__NEXT_PREVIEW_MODE_ENCRYPTION_KEY ?? "",
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
  ["build-manifest.json", () => (globalThis as Record<string, unknown>).__BUILD_MANIFEST],
  [
    "next-font-manifest.json",
    () => ({ pages: {}, app: {}, appUsingSizeAdjust: false, pagesUsingSizeAdjust: false }),
  ],
  [
    "_client-reference-manifest.js",
    () => ({ __RSC_MANIFEST: (globalThis as Record<string, unknown>).__RSC_MANIFEST }),
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
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
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
      response.flushHeaders();
      wrote = true;
      controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : new Uint8Array(chunk));
      return true;
    },
    end(chunk?: string | Uint8Array) {
      if (response.finished) return;
      if (chunk !== undefined && chunk !== null) response.write(chunk);
      response.flushHeaders();
      response.finished = true;
      controller.close();
      response.emit("finish");
      response.emit("close");
    },
    destroy(error?: unknown) {
      if (response.finished) return;
      response.destroyed = response.finished = true;
      sendHead();
      controller.error(error);
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

/** The request handler of a route of Next's Node.js server: `(req, res, ctx)`. */
export type NodeHandler = (
  req: unknown,
  res: unknown,
  context: { waitUntil?: (promise: Promise<unknown>) => void; requestMeta?: object },
) => Promise<unknown>;

/**
 * One request for a route handler, by the request handler Next's build makes
 * for it: `templates/app-route`, as `next start` calls it.
 */
export async function handleNodeRoute(
  request: ServerRequest,
  context: { waitUntil?: (promise: Promise<unknown>) => void },
  handler: NodeHandler,
): Promise<Response> {
  const req = createNodeRequest(request);
  const res = createNodeResponse();
  request.signal?.addEventListener("abort", () => res.destroy(request.signal?.reason));
  const handled = handler(req, res, {
    waitUntil: context.waitUntil,
    // The cache of the server: see cache.ts.
    requestMeta: { incrementalCache: globalThis.__incrementalCache },
  });
  // A handler that fails before it has answered. After that, the body ends.
  const failed = new Promise<never>((_, reject) =>
    handled.catch((error) => (res.headersSent ? res.destroy(error) : reject(error))),
  );
  return Promise.race([res.toResponse((headers) => toHeaders(headers)), failed]);
}

type RenderResult = {
  isNull: boolean;
  isDynamic: boolean;
  contentType?: string;
  metadata: { statusCode?: number; headers?: Record<string, unknown> };
  toUnchunkedString(): string;
  pipeTo(writable: WritableStream<Uint8Array>): Promise<void>;
};

/**
 * One request for a page, by Next's Node.js route module: `prepare()`, then
 * `render()`, as the request handler of `next start` calls them.
 *
 * That handler, `templates/app-page-runtime`, is not used yet: around these two
 * calls it has the response cache of static pages, which nothing fills here.
 */
export async function handleNodePage(
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
      getVaryHeader(pathname: string, patterns: RegExp[]): string | undefined;
    };
    default?: unknown;
  };
  const { routeModule } = ComponentMod;
  const req = createNodeRequest(request);
  const res = createNodeResponse();

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

  const result = await routeModule.render(
    new NodeNextRequest(req as never),
    new NodeNextResponse(res as never),
    renderContext,
  );
  const close = () => res.emit("close");
  if (result.isNull) {
    close();
    return new registry.Response(null, { status: 500 });
  }

  const headers = toHeaders(
    { ...res.getHeaders(), ...result.metadata.headers },
    { "content-type": result.contentType || "text/html; charset=utf-8" },
  );
  const vary = routeModule.getVaryHeader(resolvedPathname, interceptionRoutePatterns);
  if (vary) headers.set("vary", vary);
  const status = result.metadata.statusCode || res.statusCode || 200;

  if (!result.isDynamic) {
    close();
    return new registry.Response(result.toUnchunkedString(), { status, headers });
  }
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  result
    .pipeTo(writable)
    .catch((error) => console.error(error))
    .finally(close);
  return new registry.Response(readable, { status, headers });
}
