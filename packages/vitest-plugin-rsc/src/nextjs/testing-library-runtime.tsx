import { isNextRouterError } from "next/dist/client/components/is-next-router-error.js";
import type { Container } from "react-dom/client";
import { isValidElement } from "react";
import {
  cleanup as baseCleanup,
  initialize as baseInitialize,
  type RenderConfiguration,
} from "../testing-library.tsx";
import type { TestingLibraryClientRoot } from "../testing-library-client.tsx";
import { importReactClient } from "../utilts.ts";
import { readNextAppPageInitialDocument } from "./src/server/next-server.ts";
import { createPageOnlyRoutingData } from "./direct-render-routing.ts";
import {
  resolveNextRequestTarget,
  resolveRedirectUrl,
  type NextRequestTarget,
  type NextRouteHandlerManifestEntry,
  type NextRouteManifest,
  type NextRouteManifestEntry,
} from "./request-router.ts";

export type NextRenderConfiguration = Partial<RenderConfiguration>;

type NextRuntimeConfiguration = RenderConfiguration;

const nextClient = await importReactClient<typeof import("./testing-library-client.ts")>(
  "vitest-plugin-rsc/nextjs/testing-library-client",
);
const mountedContainers = new Set<Container>();
const mountedRootEntries: {
  container: Container;
  root: TestingLibraryClientRoot;
}[] = [];

let config: NextRuntimeConfiguration = {
  reactStrictMode: false,
  rootOptions: {},
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
  url?: string;
  route?: string;
  headers?: Headers | Record<string, string>;
};

type NextAppPageRenderOptions = Omit<NextRenderServerOptions, "url"> & {
  url: string;
  wrapper?: never;
};

type NextRenderSource = {
  manifest: NextRouteManifest;
};

export async function renderServer(options: NextAppPageRenderOptions): Promise<{
  container: HTMLElement;
  baseElement: HTMLElement;
  headers: Headers;
  unmount: () => Promise<void>;
  rerender: () => Promise<void>;
  asFragment: () => DocumentFragment;
}> {
  if (!isAppPageRenderOptions(options)) {
    throw new Error(
      "renderServer(<ReactNode />) and renderServer(<ReactNode />, { url }) are no longer supported by vitest-plugin-rsc/nextjs/testing-library. Use renderServer({ url }) to render a generated Next App Page route.",
    );
  }

  if ((options as { wrapper?: unknown }).wrapper !== undefined) {
    throw new Error(
      "renderServer({ url, wrapper }) is not supported for generated Next App Page routes. Render the route without a wrapper.",
    );
  }

  const { container: initialContainer, baseElement = document.body, url, route, headers } = options;
  let container = initialContainer;

  const requestUrl = url ?? "/";
  const routeManifest = await loadNextRouteManifest();
  const initialRequest = await resolveInitialNextRequestTarget({
    manifest: routeManifest,
    requestUrl,
    route,
    headers,
  });
  const initialRequestUrl = initialRequest.url;
  const responseHeaders = initialRequest.target.responseHeaders ?? new Headers();
  const hydrateDocument = true;
  container ??= document.body;

  let root: TestingLibraryClientRoot | undefined;

  if (!mountedContainers.has(container)) {
    const renderSource: NextRenderSource = { manifest: routeManifest };
    let activeRequestUrl = initialRequestUrl;

    const serverActionCaller = nextClient.createServerActionCaller();

    try {
      let documentHtml: string | undefined;
      const hydrateClientRoot = hydrateDocument;

      if (hydrateDocument) {
        shouldRestoreDocument = true;
        const initialDocument = await renderNextDocumentHtml(renderSource, activeRequestUrl, {
          headers,
          manifest: routeManifest,
        });
        activeRequestUrl = initialDocument.url;
        replaceBrowserHistoryUrl(activeRequestUrl);
        documentHtml = initialDocument.html;
        const appRenderEntry = await resolveAppRenderEntry(renderSource, activeRequestUrl);
        root = await nextClient.createNextAppRouterClientRoot({
          container,
          config: toBaseConfig(),
          serverActionCaller,
          hydrateDocument: hydrateClientRoot,
          documentHtml,
          projectRoot: appRenderEntry.rootDir ?? inferNextProjectRoot(appRenderEntry),
          route: appRenderEntry.route,
          url: activeRequestUrl,
        });
      }

      if (!root) {
        throw new Error("Next App Page render did not create a client root.");
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
  if (!root) {
    throw new Error("Next App Page render did not create a client root.");
  }

  return {
    container,
    baseElement,
    headers: responseHeaders,
    unmount: () => unmountRoot(container, false),
    rerender: async () => {
      await root.rerender();
    },
    asFragment: () => {
      return document.createRange().createContextualFragment(container.innerHTML);
    },
  };
}

async function renderNextDocumentHtml(
  source: NextRenderSource,
  url: string,
  options: { headers?: Headers | Record<string, string>; manifest?: NextRouteManifest },
) {
  if (!options.manifest) {
    throw new Error("renderServer({ url }) requires a generated Next route manifest.");
  }
  const initialDocument = await readNextAppPageInitialDocument({
    request: { url, headers: options.headers },
    manifest: options.manifest,
  });
  if (initialDocument === undefined) {
    const entry = await resolveAppRenderEntry(source, url);
    throw new Error(`No generated Next Edge App Page handler found for "${entry.appPath}".`);
  }
  return initialDocument;
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
): Promise<NextRouteManifestEntry> {
  const location = new URL(url, "http://localhost");

  const target = await resolveNextRequestTarget({
    url,
    manifest: createPageOnlyRouteManifest(source.manifest.pages),
  });
  if (target.kind !== "app-page") {
    throw new Error(`No Next app route found for URL "${location.pathname}".`);
  }
  return target.entry;
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
  headers: Headers | Record<string, string> | undefined;
}): Promise<{
  target: Exclude<NextRequestTarget, { kind: "redirect" }>;
  url: string;
}> {
  let activeUrl = options.requestUrl;

  for (let redirectCount = 0; redirectCount < 5; redirectCount++) {
    const target = await resolveNextRequestTarget({
      url: activeUrl,
      route: options.route,
      headers: options.headers,
      manifest: options.manifest,
    });

    if (target.kind === "redirect") {
      activeUrl = resolveRedirectUrl(target.url.href, activeUrl);
      continue;
    }

    const url = formatNextRequestUrl(getNextRequestTargetUrl(target));
    resolveAppPageRenderEntry(target, options.route);

    return { target, url };
  }

  throw new Error(`renderServer exceeded the Next redirect limit for ${options.requestUrl}.`);
}

function resolveAppPageRenderEntry(
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

function inferNextProjectRoot(entry: NextRouteManifestEntry) {
  const pageFile = entry.pageFile.replaceAll("\\", "/");
  for (const marker of ["/src/app/", "/app/"]) {
    const markerIndex = pageFile.indexOf(marker);
    if (markerIndex !== -1) return pageFile.slice(0, markerIndex);
  }
}

function replaceBrowserHistoryUrl(url: string) {
  const nextUrl = new URL(url, window.location.href);
  window.history.replaceState(window.history.state, "", formatNextRequestUrl(nextUrl));
}

function isAppPageRenderOptions(value: unknown): value is NextAppPageRenderOptions {
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
