import "next/dist/server/node-environment-baseline.js";
import { getAccessFallbackErrorTypeByStatus } from "next/dist/client/components/http-access-fallback/http-access-fallback.js";
import { isNextRouterError } from "next/dist/client/components/is-next-router-error.js";
import { getPreloadableFonts } from "next/dist/server/app-render/get-preloadable-fonts.js";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { encodeURIPath } from "next/dist/shared/lib/encode-uri-path.js";
import type { Container } from "react-dom/client";
import { createElement, isValidElement, type JSXElementConstructor, type ReactNode } from "react";
import {
  cleanup as baseCleanup,
  initialize as baseInitialize,
  type RenderConfiguration,
} from "../testing-library.tsx";
import type { FetchRsc, RscPayload, TestingLibraryClientRoot } from "../testing-library-client.tsx";
import { importReactClient, importReactSsr } from "../utilts.ts";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";
import { NextRouter } from "vitest-plugin-rsc/nextjs/client";
import {
  createNextDirectComponentMod,
  isNextAppRenderRedirectError,
  renderNextRouteActionResponse,
  renderNextRouteFlightResponse,
  renderNextRouteHtmlResponse,
  renderNextRouteInitialPayload,
  resetNextAppRenderCache,
  type NextInitialRscPayload,
  type NextNavigationFlightPayload,
} from "./app-render.ts";
import { getNextFontManifestForRender } from "./src/build/webpack/plugins/next-font-manifest-plugin.ts";
import {
  createNextDocumentFlightStream,
  getNextHttpAccessFallbackStatus,
  isNextHttpAccessFallbackError,
} from "./src/client/app-index.ts";
import {
  collectLoaderTreeFilePaths,
  createDirectNodeLoaderTree,
  findDeepestAccessFallbackModule,
  hasNextErrorBoundary,
  replaceFirstPageModule,
  replacePageModule,
  wrapRootLayoutLoaderTree,
  type LoaderTreeModule,
} from "./src/server/lib/app-dir-module.ts";
import {
  assertRoutePatternMatchesPath,
  createPageOnlyRoutingData,
} from "./direct-render-routing.ts";
import {
  resolveNextRequestTarget,
  resolveRedirectUrl,
  type NextRequestTarget,
  type NextRouteHandlerManifestEntry,
  type NextRouteManifest,
  type NextRouteManifestEntry,
} from "./request-router.ts";
import type { FetchNextRsc } from "./testing-library-client.ts";

export type NextRenderConfiguration = Partial<RenderConfiguration> & {
  nextRscRequestsViaMsw?: boolean;
};

type NextRuntimeConfiguration = RenderConfiguration & {
  nextRscRequestsViaMsw: boolean;
};

const client = await importReactClient<typeof import("../testing-library-client.tsx")>(
  "vitest-plugin-rsc/testing-library-client",
);
const ssr = await importReactSsr<typeof import("../testing-library-ssr.tsx")>(
  "vitest-plugin-rsc/testing-library-ssr",
);
const nextClient = await importReactClient<typeof import("./testing-library-client.ts")>(
  "vitest-plugin-rsc/nextjs/testing-library-client",
);
const mountedContainers = new Set<Container>();
const mountedRootEntries: {
  container: Container;
  root: TestingLibraryClientRoot;
}[] = [];

const NextRouterForRender = NextRouter as unknown as JSXElementConstructor<{
  route?: string;
  url?: string;
  initialFlightPayload?: NextNavigationFlightPayload;
  initialRSCPayload?: NextInitialRscPayload;
}>;

let config: NextRuntimeConfiguration = {
  reactStrictMode: false,
  rootOptions: {},
  nextRscRequestsViaMsw: false,
};
let initialDocumentSnapshot: DocumentSnapshot | undefined;
let shouldRestoreDocument = false;

export function initialize(customConfig: NextRenderConfiguration = {}): void {
  initialDocumentSnapshot ??= snapshotDocument();
  config = {
    ...config,
    ...customConfig,
    rootOptions: {
      onCaughtError: (error) => {
        if (isNextRouterError(error)) return;
        console.log(error);
      },
      ...(customConfig.rootOptions ?? {}),
    },
  };
  baseInitialize(toBaseConfig());
}

type NextRenderServerOptions = {
  container?: HTMLElement;
  baseElement?: HTMLElement;
  wrapper?: JSXElementConstructor<{ children: ReactNode }>;
  url?: string;
  route?: string;
  headers?: Headers | Record<string, string>;
};

type NextRouteRenderOptions = Omit<NextRenderServerOptions, "url"> & {
  url: string;
};

type NextRenderSource =
  | {
      kind: "node";
      getNode: () => ReactNode;
      manifest?: NextRouteManifestEntry[];
      replacementRoute?: string;
      fallbackRoute: string;
    }
  | {
      kind: "route";
      manifest: NextRouteManifestEntry[];
      wrapper?: JSXElementConstructor<{ children: ReactNode }>;
    };

const directNodePageFile = "vitest-plugin-rsc/direct-page";

export async function renderServer(
  uiOrOptions: ReactNode | NextRouteRenderOptions,
  renderOptions: NextRenderServerOptions = {},
): Promise<{
  container: HTMLElement;
  baseElement: HTMLElement;
  headers: Headers;
  unmount: () => Promise<void>;
  rerender: (ui: ReactNode) => Promise<void>;
  asFragment: () => DocumentFragment;
}> {
  const routeOnly = isRouteRenderOptions(uiOrOptions);
  const {
    container: initialContainer,
    baseElement = document.body,
    wrapper: WrapperComponent,
    url,
    route,
    headers,
  } = routeOnly ? uiOrOptions : renderOptions;
  let ui = routeOnly ? null : (uiOrOptions as ReactNode);
  let container = initialContainer;

  const requestUrl = url ?? "/";
  const explicitUrl = routeOnly || url !== undefined;
  const routeManifest = explicitUrl ? await loadNextRouteManifest() : undefined;
  const initialRequest = routeManifest
    ? await resolveInitialNextRequestTarget({
        manifest: routeManifest,
        requestUrl,
        route,
        routeOnly,
        headers,
      })
    : undefined;
  const initialRequestUrl = initialRequest?.url ?? requestUrl;
  const responseHeaders = initialRequest?.target.responseHeaders ?? new Headers();
  const location = new URL(initialRequestUrl, "http://localhost");
  const routeEntry = initialRequest?.routeEntry;
  const hydrateDocument = Boolean(routeEntry);
  container ??= hydrateDocument
    ? document.body
    : baseElement.appendChild(document.createElement("div"));

  let root: TestingLibraryClientRoot;

  if (!mountedContainers.has(container)) {
    const requestRoute = routeEntry?.route ?? route ?? location.pathname;
    const routeSource: NextRenderSource | undefined = routeEntry
      ? routeOnly
        ? { kind: "route", manifest: routeManifest!.pages, wrapper: WrapperComponent }
        : undefined
      : undefined;
    const getServerRoot = () => {
      let serverRoot = ui;
      if (!routeOnly && WrapperComponent) {
        serverRoot = <WrapperComponent>{ui}</WrapperComponent>;
      }
      return serverRoot;
    };
    const renderSource: NextRenderSource =
      routeSource ??
      ({
        kind: "node",
        getNode: getServerRoot,
        manifest: route && !routeEntry ? undefined : routeManifest?.pages,
        replacementRoute: routeEntry?.route,
        fallbackRoute: requestRoute,
      } satisfies NextRenderSource);
    let activeRequestUrl = initialRequestUrl;

    async function prepareServerRoot(
      initialRSCPayload?: NextInitialRscPayload,
    ): Promise<ReactNode> {
      let renderUrl = activeRequestUrl;
      for (let redirectCount = 0; redirectCount < 5; redirectCount++) {
        const appRenderEntry = await resolveAppRenderEntry(renderSource, renderUrl, requestRoute);
        try {
          const initialFlightPayload =
            initialRSCPayload === undefined
              ? await renderNextRouteInitialPayload({
                  loaderTree: appRenderEntry.loaderTree,
                  route: appRenderEntry.route,
                  page: appRenderEntry.appPath,
                  url: renderUrl,
                  headers,
                  componentMod: shouldUseDirectMetadataStub(renderSource, appRenderEntry)
                    ? await createNextDirectComponentMod()
                    : undefined,
                })
              : undefined;
          activeRequestUrl = renderUrl;

          return (
            <NextRouterForRender
              url={renderUrl}
              route={appRenderEntry.route}
              initialFlightPayload={initialFlightPayload}
              initialRSCPayload={initialRSCPayload}
            />
          );
        } catch (error) {
          if (initialRSCPayload !== undefined || !isNextAppRenderRedirectError(error)) {
            throw error;
          }
          renderUrl = resolveRedirectUrl(error.url, renderUrl);
        }
      }

      throw new Error(`renderServer exceeded the Next redirect limit for ${activeRequestUrl}.`);
    }

    const fetchRsc: FetchRsc = async (actionRequest) => {
      let returnValue: unknown | undefined;
      let temporaryReferences: unknown | undefined;
      if (actionRequest) {
        const { id, reply } = actionRequest;
        temporaryReferences = ReactServer.createTemporaryReferenceSet();
        const args = await ReactServer.decodeReply(reply, {
          temporaryReferences,
        });
        const action = await ReactServer.loadServerAction(id);
        returnValue = await action.apply(null, args);
      }
      const rscPayload: RscPayload = {
        root: await prepareServerRoot(),
        returnValue,
      };
      const rscOptions = { temporaryReferences };
      return ReactServer.renderToReadableStream<RscPayload>(rscPayload, rscOptions);
    };

    const fetchNextRsc: FetchNextRsc = async (request) => {
      const appRenderEntry = await resolveAppRenderEntry(renderSource, request.url, requestRoute);
      const stubMetadata = shouldUseDirectMetadataStub(renderSource, appRenderEntry);

      if (request.requestType === "next-action") {
        return renderNextRouteActionResponse({
          loaderTree: appRenderEntry.loaderTree,
          route: appRenderEntry.route,
          page: appRenderEntry.appPath,
          url: request.url,
          actionId: request.id,
          reply: request.reply,
          routerState: request.routerState,
          nextUrl: request.nextUrl,
          blockRedirectFlight: renderSource.kind === "node",
          stubMetadata,
        });
      }

      return renderNextRouteFlightResponse({
        loaderTree: appRenderEntry.loaderTree,
        route: appRenderEntry.route,
        page: appRenderEntry.appPath,
        url: request.url,
        routerState: request.routerState,
        componentMod: stubMetadata ? await createNextDirectComponentMod() : undefined,
      });
    };

    const serverActionCaller = config.nextRscRequestsViaMsw
      ? nextClient.createServerActionCaller({ fetchRsc: fetchNextRsc })
      : undefined;

    try {
      let initialStream: ReadableStream<Uint8Array> | undefined;
      let documentHtml: string | undefined;
      let documentOnly = false;
      let hydrateClientRoot = hydrateDocument;
      const renderServerRootForHydration = async (serverRoot: ReactNode) => {
        const rscPayload: RscPayload = { root: serverRoot };
        const rscStream = ReactServer.renderToReadableStream<RscPayload>(rscPayload);
        const [ssrStream, clientStream] = rscStream.tee();
        return {
          documentHtml: await ssr.renderToHtml(ssrStream),
          initialStream: clientStream,
          hydrateDocument: true,
          documentOnly: false,
        };
      };
      const renderNextDocumentClientFallback = async (status?: number) => {
        const appRenderEntry = await resolveAppRenderEntry(
          renderSource,
          activeRequestUrl,
          requestRoute,
        );
        if (status !== undefined) {
          const accessFallbackNode = await loadDeepestAccessFallbackNode(
            appRenderEntry.loaderTree,
            status,
          );
          if (accessFallbackNode) {
            return renderServerRootForHydration(accessFallbackNode);
          }
        }

        const documentHtml = await renderNextDocumentHtml(
          renderSource,
          activeRequestUrl,
          requestRoute,
          {
            headers,
          },
        );
        const initialRSCPayload = await createNextDocumentInitialPayload(documentHtml);
        if (status !== undefined) {
          const initialAccessFallbackNode = findInitialAccessFallbackNode(initialRSCPayload);
          if (initialAccessFallbackNode) {
            return renderServerRootForHydration(initialAccessFallbackNode);
          }
          applyInitialAccessFallback(initialRSCPayload);
        }
        const rscPayload: RscPayload = {
          root: await prepareServerRoot(initialRSCPayload),
        };

        return {
          documentHtml,
          initialStream: ReactServer.renderToReadableStream<RscPayload>(rscPayload),
          hydrateDocument: status === undefined,
          documentOnly: false,
        };
      };

      if (hydrateDocument) {
        shouldRestoreDocument = true;
        try {
          initialStream = await fetchRsc();
          const [inspectionStream, renderStream] = initialStream.tee();
          const flightPayloadText = await readReadableStreamText(inspectionStream);
          const accessFallbackStatus = getNextHttpAccessFallbackStatus(flightPayloadText);
          if (accessFallbackStatus) {
            const fallbackRender = await renderNextDocumentClientFallback(accessFallbackStatus);
            documentHtml = fallbackRender.documentHtml;
            initialStream = fallbackRender.initialStream;
            hydrateClientRoot = fallbackRender.hydrateDocument;
            documentOnly = fallbackRender.documentOnly;
          } else {
            const [ssrStream, clientStream] = renderStream.tee();
            initialStream = clientStream;
            documentHtml = await ssr.renderToHtml(ssrStream);
            if (isBlankDocumentHtml(documentHtml)) {
              const fallbackRender = await renderNextDocumentClientFallback();
              documentHtml = fallbackRender.documentHtml;
              initialStream = fallbackRender.initialStream;
              hydrateClientRoot = fallbackRender.hydrateDocument;
              documentOnly = fallbackRender.documentOnly;
            }
          }
        } catch (error) {
          const accessFallbackStatus = getNextHttpAccessFallbackStatus(error);
          if (
            accessFallbackStatus === undefined &&
            !isNextBuiltinGlobalErrorReferenceError(error) &&
            !hasNextErrorBoundary(
              (await resolveAppRenderEntry(renderSource, activeRequestUrl, requestRoute))
                .loaderTree,
            )
          ) {
            throw error;
          }

          const fallbackRender = await renderNextDocumentClientFallback(accessFallbackStatus);
          documentHtml = fallbackRender.documentHtml;
          initialStream = fallbackRender.initialStream;
          hydrateClientRoot = fallbackRender.hydrateDocument;
          documentOnly = fallbackRender.documentOnly;
        }
      }

      const clientRootOptions = {
        container,
        config: toBaseConfig(),
        fetchRsc,
        serverActionCaller,
        hydrateDocument: hydrateClientRoot,
        documentOnly,
        initialStream,
        documentHtml,
      };

      try {
        root = await client.createTestingLibraryClientRoot(clientRootOptions);
      } catch (error) {
        if (
          !hydrateDocument ||
          documentOnly ||
          (getNextHttpAccessFallbackStatus(error) === undefined &&
            !isNextBuiltinGlobalErrorReferenceError(error) &&
            !hasNextErrorBoundary(
              (await resolveAppRenderEntry(renderSource, activeRequestUrl, requestRoute))
                .loaderTree,
            ))
        ) {
          throw error;
        }

        const fallbackRender = await renderNextDocumentClientFallback(
          getNextHttpAccessFallbackStatus(error),
        );
        root = await client.createTestingLibraryClientRoot({
          ...clientRootOptions,
          hydrateDocument: fallbackRender.hydrateDocument,
          documentOnly: fallbackRender.documentOnly,
          initialStream: fallbackRender.initialStream,
          documentHtml: fallbackRender.documentHtml,
        });
      }
      injectNextFontStyles();
      if (hydrateDocument) {
        injectNextFontPreloadLinks(
          (await resolveAppRenderEntry(renderSource, activeRequestUrl, requestRoute)).loaderTree,
        );
      }
    } catch (error) {
      serverActionCaller?.cleanup();
      throw error;
    }
    mountedRootEntries.push({ container, root });
    mountedContainers.add(container);
  } else {
    root = mountedRootEntries.find((it) => it.container === container)!.root;
  }

  return {
    container,
    baseElement,
    headers: responseHeaders,
    unmount: () => unmountRoot(container, false),
    rerender: async (newUi) => {
      ui = newUi;
      await root.rerender();
    },
    asFragment: () => {
      return document.createRange().createContextualFragment(container.innerHTML);
    },
  };
}

function isBlankDocumentHtml(html: string | undefined) {
  return !html?.trim();
}

function isNextBuiltinGlobalErrorReferenceError(error: unknown) {
  return getErrorMessage(error).includes("next_dist_client_components_builtin_global-error");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

async function renderNextDocumentHtml(
  source: NextRenderSource,
  url: string,
  requestRoute: string,
  options: { headers?: Headers | Record<string, string> },
) {
  const appRenderEntry = await resolveAppRenderEntry(source, url, requestRoute);
  const componentMod = shouldUseDirectMetadataStub(source, appRenderEntry)
    ? await createNextDirectComponentMod()
    : undefined;
  const response = await renderNextRouteHtmlResponse({
    loaderTree: appRenderEntry.loaderTree,
    route: appRenderEntry.route,
    page: appRenderEntry.appPath,
    url,
    headers: options.headers,
    componentMod,
  });
  return response.text();
}

async function createNextDocumentInitialPayload(html: string) {
  return ReactServer.createFromReadableStream<NextInitialRscPayload>(
    createNextDocumentFlightStream(html),
  );
}

function applyInitialAccessFallback(payload: NextInitialRscPayload) {
  for (const flightDataPath of payload.f) {
    const seedData = flightDataPath[flightDataPath.length - 3] as
      | NextCacheNodeSeedData
      | null
      | undefined;
    replaceAccessFallbackSeedData(seedData);
  }
}

function findInitialAccessFallbackNode(payload: NextInitialRscPayload) {
  for (const flightDataPath of payload.f) {
    const seedData = flightDataPath[flightDataPath.length - 3] as
      | NextCacheNodeSeedData
      | null
      | undefined;
    const found = findNotFoundNode(seedData?.[0]);
    if (found) return found;
  }
}

type NextCacheNodeSeedData = [
  node: ReactNode | null,
  parallelRoutes: Record<string, NextCacheNodeSeedData | null>,
  loading: null,
  isPartial: boolean,
  varyParams: unknown,
];

function replaceAccessFallbackSeedData(
  seedData: NextCacheNodeSeedData | null | undefined,
  inheritedNotFound?: ReactNode,
) {
  if (!seedData) return;

  const node = seedData[0];
  const notFound = findNotFoundNode(node) ?? inheritedNotFound;
  if (notFound && isAccessFallbackSeedNode(seedData)) {
    seedData[0] = notFound;
  }

  for (const child of Object.values(seedData[1])) {
    replaceAccessFallbackSeedData(child, notFound);
  }
}

function isAccessFallbackSeedNode(seedData: NextCacheNodeSeedData) {
  return containsAccessFallback(seedData[0]) || isLeafLazySeedNode(seedData);
}

function isLeafLazySeedNode(seedData: NextCacheNodeSeedData) {
  return Object.keys(seedData[1]).length === 0 && containsThenable(seedData[0]);
}

function findNotFoundNode(value: unknown): ReactNode | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNotFoundNode(item);
      if (found) return found;
    }
    return;
  }

  if (!isValidElement(value)) return;

  const props = value.props as { children?: unknown; notFound?: unknown };
  const child = findNotFoundNode(props.children);
  if (child) return child;

  if (Array.isArray(props.notFound) && props.notFound[0]) {
    return props.notFound[0] as ReactNode;
  }
}

function containsAccessFallback(value: unknown): boolean {
  if (isNextHttpAccessFallbackError(value)) return true;
  if (isRejectedAccessFallbackThenable(value)) return true;

  if (Array.isArray(value)) {
    return value.some((item) => containsAccessFallback(item));
  }

  if (isValidElement(value)) {
    return containsAccessFallback((value.props as { children?: unknown }).children);
  }

  return false;
}

function containsThenable(value: unknown): boolean {
  if (isThenable(value)) return true;

  if (Array.isArray(value)) {
    return value.some((item) => containsThenable(item));
  }

  if (isValidElement(value)) {
    return containsThenable((value.props as { children?: unknown }).children);
  }

  return false;
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function isRejectedAccessFallbackThenable(value: unknown) {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as {
    status?: unknown;
    reason?: unknown;
    _reason?: unknown;
    value?: unknown;
    _value?: unknown;
  };
  if (candidate.status !== "rejected") return false;

  return (
    isNextHttpAccessFallbackError(candidate.reason) ||
    isNextHttpAccessFallbackError(candidate._reason) ||
    isNextHttpAccessFallbackError(candidate.value) ||
    isNextHttpAccessFallbackError(candidate._value)
  );
}

async function unmountRoot(container: Container, removeContainer: boolean) {
  const index = mountedRootEntries.findIndex((it) => it.container === container);
  if (index === -1) return;

  const entry = mountedRootEntries.splice(index, 1)[0];
  if (!entry) return;

  mountedContainers.delete(container);
  await entry.root.unmount();
  if (removeContainer && container.parentNode === document.body) {
    document.body.removeChild(container);
  }
}

function toBaseConfig(): RenderConfiguration {
  return {
    reactStrictMode: config.reactStrictMode,
    rootOptions: config.rootOptions,
  };
}

async function resolveAppRenderEntry(
  source: NextRenderSource,
  url: string,
  defaultRoute: string,
): Promise<NextRouteManifestEntry> {
  const location = new URL(url, "http://localhost");

  if (source.kind === "route") {
    const target = await resolveNextRequestTarget({
      url,
      manifest: createPageOnlyRouteManifest(source.manifest),
    });
    if (target.kind !== "app-page") {
      throw new Error(`No Next app route found for URL "${location.pathname}".`);
    }
    const entry = target.entry;
    return source.wrapper
      ? {
          ...entry,
          loaderTree: wrapRootLayoutLoaderTree(entry.loaderTree, source.wrapper),
        }
      : entry;
  }

  const target = source.manifest
    ? await resolveNextRequestTarget({
        url,
        manifest: createPageOnlyRouteManifest(source.manifest),
      })
    : undefined;
  const entry = target?.kind === "app-page" ? target.entry : undefined;
  if (entry) {
    if (source.replacementRoute && entry.route === source.replacementRoute) {
      return replaceRoutePageWithNode(entry, source.getNode());
    }
    return entry;
  }

  assertRoutePatternMatchesPath(defaultRoute, location.pathname);
  return createDirectNodeRouteEntry(defaultRoute, source.getNode());
}

function replaceRoutePageWithNode(
  entry: NextRouteManifestEntry,
  node: ReactNode,
): NextRouteManifestEntry {
  const createReplacement = (originalPageModule: LoaderTreeModule | undefined) =>
    createPageReplacementModule(originalPageModule, node);

  const replacement = replacePageModule(entry.loaderTree, entry.pageFile, createReplacement);

  return {
    ...entry,
    loaderTree: replacement.replaced
      ? replacement.loaderTree
      : replaceFirstPageModule(entry.loaderTree, createReplacement).loaderTree,
  };
}

function createPageReplacementModule(
  originalPageModule: LoaderTreeModule | undefined,
  node: ReactNode,
): LoaderTreeModule {
  return [
    async () => ({
      ...(originalPageModule ? await originalPageModule[0]() : {}),
      default: function VitestNextRoutePageReplacement() {
        return node;
      },
    }),
    originalPageModule?.[1] ?? "vitest-plugin-rsc/page-replacement",
  ];
}

function createDirectNodeRouteEntry(route: string, node: ReactNode): NextRouteManifestEntry {
  return {
    route,
    appPath: createAppPageFromRoutePattern(route),
    pageFile: directNodePageFile,
    loaderTree: createDirectNodeLoaderTree({
      routePattern: route,
      node,
      pageFile: directNodePageFile,
    }),
  };
}

function createAppPageFromRoutePattern(routePattern: string) {
  const withLeadingSlash = routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
  const route = withLeadingSlash.replace(/\/$/, "");
  return `${route === "" ? "" : route}/page`;
}

async function loadNextRouteManifest() {
  const { nextRouteManifest, nextRouteHandlerManifest, routing } =
    await import("virtual:vitest-plugin-rsc/next-routes");
  return {
    pages: nextRouteManifest as NextRouteManifestEntry[],
    routeHandlers: nextRouteHandlerManifest as NextRouteHandlerManifestEntry[],
    routingData: routing,
  } satisfies NextRouteManifest;
}

async function resolveInitialNextRequestTarget(options: {
  manifest: NextRouteManifest;
  requestUrl: string;
  route: string | undefined;
  routeOnly: boolean;
  headers: Headers | Record<string, string> | undefined;
}): Promise<{
  target: Exclude<NextRequestTarget, { kind: "redirect" }>;
  url: string;
  routeEntry?: NextRouteManifestEntry;
}> {
  let activeUrl = options.requestUrl;

  for (let redirectCount = 0; redirectCount < 5; redirectCount++) {
    const target = await resolveNextRequestTarget({
      url: activeUrl,
      route: options.routeOnly ? options.route : undefined,
      headers: options.headers,
      manifest: options.manifest,
    });

    if (target.kind === "redirect") {
      activeUrl = resolveRedirectUrl(target.url.href, activeUrl);
      continue;
    }

    const url = formatNextRequestUrl(getNextRequestTargetUrl(target));
    const routeEntry = options.routeOnly
      ? resolveRouteOnlyEntry(target, options.route)
      : resolveDirectRenderEntry(target, options.route);

    return { target, url, routeEntry };
  }

  throw new Error(`renderServer exceeded the Next redirect limit for ${options.requestUrl}.`);
}

function resolveRouteOnlyEntry(
  target: Exclude<NextRequestTarget, { kind: "redirect" }>,
  route: string | undefined,
) {
  if (target.kind === "app-page") return target.entry;
  if (target.kind === "app-route") {
    throw new Error(
      `renderServer({ url: "${target.invocationUrl.pathname}" }) matched Next route handler "${target.entry.appPath}" at ${target.entry.routeFile}. Route handlers are not page render targets yet; import the route handler directly or use a future route-handler testing helper.`,
    );
  }

  const routeHint = route
    ? ` route "${route}"`
    : ` URL "${getNextRequestTargetUrl(target).pathname}"`;
  throw new Error(`No Next app route found for${routeHint}.`);
}

function resolveDirectRenderEntry(
  target: Exclude<NextRequestTarget, { kind: "redirect" }>,
  route: string | undefined,
) {
  if (target.kind !== "app-page") return;
  if (!route) return target.entry;
  return target.entry.route === route ? target.entry : undefined;
}

function getNextRequestTargetUrl(target: Exclude<NextRequestTarget, { kind: "redirect" }>) {
  if (target.kind === "app-page" || target.kind === "app-route") return target.invocationUrl;
  if (target.kind === "external-rewrite") return target.url;
  return target.requestedUrl;
}

function createPageOnlyRouteManifest(pages: NextRouteManifestEntry[]): NextRouteManifest {
  return {
    pages,
    routeHandlers: [],
    routingData: createPageOnlyRoutingData(pages),
  };
}

function formatNextRequestUrl(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function shouldUseDirectMetadataStub(source: NextRenderSource, entry: NextRouteManifestEntry) {
  return source.kind === "node" && entry.pageFile === directNodePageFile;
}

async function loadDeepestAccessFallbackNode(
  loaderTree: LoaderTree,
  status: number,
): Promise<ReactNode | undefined> {
  const moduleName = getAccessFallbackErrorTypeByStatus(status);
  if (!moduleName) return;

  const fallbackModule = findDeepestAccessFallbackModule(loaderTree, moduleName);
  if (!fallbackModule) return;

  const mod = await fallbackModule[0]();
  const Fallback = mod.default as JSXElementConstructor<Record<string, never>> | undefined;
  return Fallback ? createElement(Fallback) : undefined;
}

function isRouteRenderOptions(value: unknown): value is NextRouteRenderOptions {
  return Boolean(
    value &&
    typeof value === "object" &&
    !isValidElement(value) &&
    "url" in value &&
    typeof (value as { url?: unknown }).url === "string",
  );
}

export async function cleanup() {
  try {
    const rootEntries = Array.from(mountedRootEntries);
    for (const { container } of rootEntries) {
      await unmountRoot(container, true);
    }
  } finally {
    mountedRootEntries.length = 0;
    mountedContainers.clear();
    await baseCleanup();
    restoreInitialDocument();
    await resetNextAppRenderCache();
  }
}

type DocumentSnapshot = {
  htmlAttributes: [string, string][];
  headAttributes: [string, string][];
  headChildren: Node[];
  bodyAttributes: [string, string][];
};

function snapshotDocument(): DocumentSnapshot {
  return {
    htmlAttributes: snapshotAttributes(document.documentElement),
    headAttributes: snapshotAttributes(document.head),
    headChildren: Array.from(document.head.childNodes).map((node) => node.cloneNode(true)),
    bodyAttributes: snapshotAttributes(document.body),
  };
}

function restoreInitialDocument() {
  if (!shouldRestoreDocument) return;
  shouldRestoreDocument = false;
  if (!initialDocumentSnapshot) return;

  restoreAttributes(document.documentElement, initialDocumentSnapshot.htmlAttributes);
  restoreAttributes(document.head, initialDocumentSnapshot.headAttributes);
  document.head.replaceChildren(
    ...initialDocumentSnapshot.headChildren.map((node) => document.importNode(node, true)),
  );
  restoreAttributes(document.body, initialDocumentSnapshot.bodyAttributes);
  document.body.replaceChildren();
}

function snapshotAttributes(element: Element): [string, string][] {
  return Array.from(element.attributes, ({ name, value }) => [name, value]);
}

function restoreAttributes(element: Element, attributes: [string, string][]) {
  for (const { name } of Array.from(element.attributes)) {
    element.removeAttribute(name);
  }
  for (const [name, value] of attributes) {
    element.setAttribute(name, value);
  }
}

function injectNextFontStyles() {
  const fontStyles = (globalThis as typeof globalThis & Record<symbol, Map<string, string>>)[
    Symbol.for("vitest-plugin-rsc.nextjs.fontStyles")
  ];
  if (!fontStyles) return;

  for (const [id, css] of fontStyles) {
    if (document.getElementById(id)) continue;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }
}

function injectNextFontPreloadLinks(loaderTree: LoaderTree) {
  const manifest = getNextFontManifestForRender();
  const injectedFontPreloadTags = new Set<string>();

  for (const filePath of collectLoaderTreeFilePaths(loaderTree)) {
    const preloadedFonts = getPreloadableFonts(manifest, filePath, injectedFontPreloadTags);
    if (!preloadedFonts?.length) continue;

    for (const fontFile of preloadedFonts) {
      const href = `${readNextAssetPrefix()}/_next/${encodeURIPath(fontFile)}`;
      if (document.head.querySelector(`link[rel="preload"][as="font"][href="${href}"]`)) {
        continue;
      }

      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "font";
      link.href = href;
      link.type = getFontPreloadType(fontFile);
      document.head.appendChild(link);
    }
  }
}

function readNextAssetPrefix() {
  return typeof process.env.__NEXT_ASSET_PREFIX === "string" ? process.env.__NEXT_ASSET_PREFIX : "";
}

function getFontPreloadType(fontFile: string) {
  const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(fontFile)?.[1];
  return ext ? `font/${ext}` : "";
}
