import "next/dist/server/node-environment-baseline";
import { isNextRouterError } from "next/dist/client/components/is-next-router-error.js";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths.js";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher.js";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";
import { PAGE_SEGMENT_KEY } from "next/dist/shared/lib/segment.js";
import type { Container } from "react-dom/client";
import { createElement, isValidElement, type JSXElementConstructor, type ReactNode } from "react";
import {
  cleanup as baseCleanup,
  initialize as baseInitialize,
  type RenderConfiguration,
} from "../testing-library";
import type { FetchRsc, RscPayload, TestingLibraryClientRoot } from "../testing-library-client";
import { importReactClient, importReactSsr } from "../utilts";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";
import { NextRouter } from "vitest-plugin-rsc/nextjs/client";
import {
  createNextDirectComponentMod,
  renderNextRouteActionResponse,
  renderNextRouteFlightResponse,
  renderNextRouteInitialPayload,
  resetNextAppRenderCache,
  type NextNavigationFlightPayload,
} from "./app-render";
import type { FetchNextRsc } from "./testing-library-client";

export * from "../testing-library";

export type NextRenderConfiguration = Partial<RenderConfiguration> & {
  nextRscRequestsViaMsw?: boolean;
};

type NextRouteManifestEntry = {
  route: string;
  appPath: string;
  pageFile: string;
  loaderTree: LoaderTree;
};

type NextRuntimeConfiguration = RenderConfiguration & {
  nextRscRequestsViaMsw: boolean;
};

const client = await importReactClient<typeof import("../testing-library-client")>(
  "vitest-plugin-rsc/testing-library-client",
);
const ssr = await importReactSsr<typeof import("../testing-library-ssr")>(
  "vitest-plugin-rsc/testing-library-ssr",
);
const nextClient = await importReactClient<typeof import("./testing-library-client")>(
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
  initialFlightPayload: NextNavigationFlightPayload;
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

type LoaderTreeModule = [loader: () => Promise<Record<string, unknown>>, filePath: string];
const directNodePageFile = "vitest-plugin-rsc/direct-page";

export async function renderServer(
  uiOrOptions: ReactNode | NextRouteRenderOptions,
  renderOptions: NextRenderServerOptions = {},
): Promise<{
  container: HTMLElement;
  baseElement: HTMLElement;
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
  const location = new URL(requestUrl, "http://localhost");
  const explicitUrl = routeOnly || url !== undefined;
  const routeManifest = explicitUrl ? await loadNextRouteManifest() : undefined;
  const routeEntry = routeManifest
    ? routeOnly
      ? resolveNextRoute(routeManifest, route, location.pathname)
      : tryResolveDirectRenderRoute(routeManifest, route, location.pathname)
    : undefined;
  const hydrateDocument = Boolean(routeEntry);
  container ??= hydrateDocument
    ? document.body
    : baseElement.appendChild(document.createElement("div"));

  let root: TestingLibraryClientRoot;

  if (!mountedContainers.has(container)) {
    const requestRoute = routeEntry?.route ?? route ?? location.pathname;
    const routeSource: NextRenderSource | undefined = routeEntry
      ? routeOnly
        ? { kind: "route", manifest: routeManifest!, wrapper: WrapperComponent }
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
        manifest: route && !routeEntry ? undefined : routeManifest,
        replacementRoute: routeEntry?.route,
        fallbackRoute: requestRoute,
      } satisfies NextRenderSource);

    async function prepareServerRoot(): Promise<ReactNode> {
      const appRenderEntry = resolveAppRenderEntry(renderSource, requestUrl, requestRoute);
      const componentMod = shouldUseDirectMetadataStub(renderSource, appRenderEntry)
        ? await createNextDirectComponentMod()
        : undefined;
      const initialFlightPayload = await renderNextRouteInitialPayload({
        loaderTree: appRenderEntry.loaderTree,
        route: appRenderEntry.route,
        page: appRenderEntry.appPath,
        url: requestUrl,
        headers,
        componentMod,
      });

      return (
        <NextRouterForRender
          url={requestUrl}
          route={appRenderEntry.route}
          initialFlightPayload={initialFlightPayload}
        />
      );
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
      const appRenderEntry = resolveAppRenderEntry(renderSource, request.url, requestRoute);
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
      if (hydrateDocument) {
        shouldRestoreDocument = true;
        initialStream = await fetchRsc();
        const [ssrStream, clientStream] = initialStream.tee();
        initialStream = clientStream;
        documentHtml = await ssr.renderToHtml(ssrStream);
      }

      root = await client.createTestingLibraryClientRoot({
        container,
        config: toBaseConfig(),
        fetchRsc,
        serverActionCaller,
        hydrateDocument,
        initialStream,
        documentHtml,
      });
      injectNextFontStyles();
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

function resolveAppRenderEntry(
  source: NextRenderSource,
  url: string,
  defaultRoute: string,
): NextRouteManifestEntry {
  const location = new URL(url, "http://localhost");

  if (source.kind === "route") {
    const entry = resolveNextRoute(source.manifest, undefined, location.pathname);
    return source.wrapper
      ? {
          ...entry,
          loaderTree: wrapRootLayoutLoaderTree(entry.loaderTree, source.wrapper),
        }
      : entry;
  }

  const entry = source.manifest
    ? tryResolveNextRoute(source.manifest, undefined, location.pathname)
    : undefined;
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
    loaderTree: createDirectNodeLoaderTree(route, node),
  };
}

function createAppPageFromRoutePattern(routePattern: string) {
  const withLeadingSlash = routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
  const route = withLeadingSlash.replace(/\/$/, "");
  return `${route === "" ? "" : route}/page`;
}

async function loadNextRouteManifest() {
  const { nextRouteManifest } = await import("virtual:vitest-plugin-rsc/next-routes");
  return nextRouteManifest as NextRouteManifestEntry[];
}

function resolveNextRoute(
  nextRouteManifest: NextRouteManifestEntry[],
  route: string | undefined,
  pathname: string,
) {
  const entry = tryResolveNextRoute(nextRouteManifest, route, pathname);

  if (!entry) {
    const routeHint = route ? ` route "${route}"` : ` URL "${pathname}"`;
    throw new Error(`No Next app route found for${routeHint}.`);
  }

  return entry;
}

function tryResolveNextRoute(
  nextRouteManifest: NextRouteManifestEntry[],
  route: string | undefined,
  pathname: string,
) {
  return route
    ? (nextRouteManifest.find((candidate) => candidate.route === route) ??
        nextRouteManifest.find((candidate) => matchRoutePattern(candidate.route, pathname)))
    : nextRouteManifest.find((candidate) => matchRoutePattern(candidate.route, pathname));
}

function tryResolveDirectRenderRoute(
  nextRouteManifest: NextRouteManifestEntry[],
  route: string | undefined,
  pathname: string,
) {
  if (!route) {
    return nextRouteManifest.find((candidate) => matchRoutePattern(candidate.route, pathname));
  }

  const entry = nextRouteManifest.find((candidate) => candidate.route === route);
  return entry && matchRoutePattern(route, pathname) ? entry : undefined;
}

function matchRoutePattern(routePattern: string, pathname: string) {
  try {
    const normalizedRoutePattern = normalizeRoutePattern(routePattern);
    return Boolean(getRouteMatcher(getRouteRegex(normalizedRoutePattern))(pathname));
  } catch {
    return false;
  }
}

function assertRoutePatternMatchesPath(routePattern: string, pathname: string) {
  if (matchRoutePattern(routePattern, pathname)) return;

  throw new Error(`Pattern "${routePattern}" does not match pathname "${pathname}".`);
}

function normalizeRoutePattern(routePattern: string) {
  const withLeadingSlash = routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
  const withoutTrailingSlash = withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/$/, "");
  return normalizeAppPath(`${withoutTrailingSlash}/page`);
}

function createDirectNodeLoaderTree(routePattern: string, node: ReactNode): LoaderTree {
  function VitestDirectPage() {
    return node;
  }

  function VitestDirectRootLayout({ children }: { children: ReactNode }) {
    return children;
  }

  const pageModule: LoaderTreeModule = [
    async () => ({ default: VitestDirectPage }),
    directNodePageFile,
  ];
  const rootLayoutModule: LoaderTreeModule = [
    async () => ({ default: VitestDirectRootLayout }),
    "vitest-plugin-rsc/direct-layout",
  ];

  return createLoaderTree(routePattern, pageModule, rootLayoutModule);
}

function shouldUseDirectMetadataStub(source: NextRenderSource, entry: NextRouteManifestEntry) {
  return source.kind === "node" && entry.pageFile === directNodePageFile;
}

function createLoaderTree(
  routePattern: string,
  pageModule: LoaderTreeModule,
  rootLayoutModule: LoaderTreeModule,
): LoaderTree {
  // Begin copy: Next.js LoaderTree tuple shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/lib/app-dir-module.ts#L4-L29
  // Adaptation: direct ReactNode renders synthesize a private app route so the
  // rest of the render can go through Next app-render.
  const stripSlash = (s: string) => s.replace(/^\/|\/$/g, "");
  const patternSegs = stripSlash(routePattern).split("/").filter(Boolean);
  let child: LoaderTree = [PAGE_SEGMENT_KEY, {}, { page: pageModule }, null] as never;

  for (let index = patternSegs.length - 1; index >= 0; index--) {
    child = [patternSegs[index]!, { children: child }, {}, null] as never;
  }

  const loaderTree = ["", { children: child }, { layout: rootLayoutModule }, null] as LoaderTree;
  // End copy
  return loaderTree;
}

function wrapRootLayoutLoaderTree(
  loaderTree: LoaderTree,
  Wrapper: JSXElementConstructor<{ children: ReactNode }>,
): LoaderTree {
  const [segment, parallelRoutes, modules, metadata] = loaderTree;
  const layout = modules.layout;
  if (!layout) return loaderTree;

  const wrappedLayout: LoaderTreeModule = [
    async () => {
      const mod = await layout[0]();
      const RootLayout = mod.default as JSXElementConstructor<{ children: ReactNode }>;

      return {
        ...mod,
        default(props: { children: ReactNode }) {
          return createElement(Wrapper, null, createElement(RootLayout, props));
        },
      };
    },
    layout[1],
  ];

  return [segment, parallelRoutes, { ...modules, layout: wrappedLayout }, metadata] as LoaderTree;
}

function replacePageModule(
  loaderTree: LoaderTree,
  pageFile: string,
  createPageModule: (originalPageModule: LoaderTreeModule | undefined) => LoaderTreeModule,
): { loaderTree: LoaderTree; replaced: boolean } {
  const [segment, parallelRoutes, modules, metadata] = loaderTree;
  let replaced = modules.page?.[1] === pageFile;
  const nextModules = replaced
    ? { ...modules, page: createPageModule(modules.page) }
    : modules;
  const nextParallelRoutes: Record<string, LoaderTree> = {};

  for (const [key, childTree] of Object.entries(parallelRoutes)) {
    const child = replacePageModule(childTree as LoaderTree, pageFile, createPageModule);
    nextParallelRoutes[key] = child.loaderTree;
    replaced ||= child.replaced;
  }

  return {
    loaderTree: [segment, nextParallelRoutes, nextModules, metadata] as LoaderTree,
    replaced,
  };
}

function replaceFirstPageModule(
  loaderTree: LoaderTree,
  createPageModule: (originalPageModule: LoaderTreeModule | undefined) => LoaderTreeModule,
): { loaderTree: LoaderTree; replaced: boolean } {
  const [segment, parallelRoutes, modules, metadata] = loaderTree;
  if (modules.page) {
    return {
      loaderTree: [
        segment,
        parallelRoutes,
        { ...modules, page: createPageModule(modules.page) },
        metadata,
      ] as LoaderTree,
      replaced: true,
    };
  }

  const nextParallelRoutes: Record<string, LoaderTree> = {};
  let replaced = false;

  for (const [key, childTree] of Object.entries(parallelRoutes)) {
    if (replaced) {
      nextParallelRoutes[key] = childTree as LoaderTree;
      continue;
    }

    const child = replaceFirstPageModule(childTree as LoaderTree, createPageModule);
    nextParallelRoutes[key] = child.loaderTree;
    replaced = child.replaced;
  }

  return {
    loaderTree: [segment, nextParallelRoutes, modules, metadata] as LoaderTree,
    replaced,
  };
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
    resetNavigationSpy();
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

type NavigationSpy = {
  mockClear: () => void;
};

function resetNavigationSpy() {
  (globalThis as typeof globalThis & { onNavigate?: NavigationSpy }).onNavigate?.mockClear();
}

// @ts-ignore
const expect = globalThis[Symbol.for("expect-global")];

export async function expectToHaveBeenNavigatedTo(url: Partial<URL>) {
  expect(globalThis.onNavigate).toHaveBeenCalledWith(expect.objectContaining(url));
}
