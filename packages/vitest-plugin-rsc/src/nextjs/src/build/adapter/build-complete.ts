import path from "node:path";
import type { Route as NextRoutingRoute } from "@next/routing";
import { generateRoutesManifest } from "next/dist/build/generate-routes-manifest.js";
import type {
  ManifestHeaderRoute,
  ManifestRedirectRoute,
  ManifestRewriteRoute,
} from "next/dist/build/index.js";
import type { DynamicManifestRoute } from "next/dist/build/utils.js";
import routingUtils from "next/dist/compiled/@vercel/routing-utils/superstatic.js";
import { getRedirectStatus, modifyRouteRegex } from "next/dist/lib/redirect-status.js";
import type { CustomRoutes, Rewrite } from "next/dist/lib/load-custom-routes.js";
import type { NextConfigComplete } from "next/dist/server/config-shared.js";
import { addPathPrefix } from "next/dist/shared/lib/router/utils/add-path-prefix.js";
import { getNamedRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";
import type { NextProjectConfig } from "../../../config.ts";
import { nextRoutingBuildId, type NextRoutingData } from "../../../routing-types.ts";
import {
  createNextAppRouteLoaderOptions,
  createNextAppLoaderOptions,
  createNextEdgeAppRouteVirtualSource,
  createNextEdgeSsrAppVirtualSource,
  createNextRouteTreeVirtualSource,
} from "../entries.ts";
import type { NextRouteHandlerManifestBuildEntry } from "../../server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts";
import type { NextRouteManifestBuildEntry } from "../../server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts";

// Mirror/adapt: Next.js build-complete adapter routing payload.
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/adapter/build-complete.ts
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/generate-routes-manifest.ts
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next-routing/src/types.ts
// Adaptation: Vitest has discovered route facts instead of production build
// outputs. This file keeps the Next adapter's routing data names and route
// conversion shape, but it receives pages/route handlers from Vite discovery
// and serializes the payload for the browser runtime to consume.

export type { NextRoutingData } from "../../../routing-types.ts";

// Begin adapted: Next.js adapter routing payload assembly
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/adapter/build-complete.ts
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/generate-routes-manifest.ts
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next-routing/src/types.ts
// Adaptation: Next production build-complete receives build output manifests.
// Vitest receives Vite-discovered route facts, then preserves Next's route
// manifest generation, adapter `routing` shape, and @next/routing data names.
type NextRoutingCustomRoutes = Omit<CustomRoutes, "rewrites"> & {
  rewrites: CustomRoutes["rewrites"] | Rewrite[];
};

type NextRoutingRouteEntry = {
  route: string;
};

export type NextRoutingManifest = {
  pages: NextRoutingRouteEntry[];
  routeHandlers: NextRoutingRouteEntry[];
  customRoutes: NextRoutingCustomRoutes;
  nextConfig?: NextRoutesManifestConfig;
};

type NextRoutesManifestConfig = {
  basePath?: string;
  cacheComponents?: boolean;
  i18n?: NextConfigComplete["i18n"];
  skipTrailingSlashRedirect?: boolean;
  trailingSlash?: boolean;
  experimental?: {
    caseSensitiveRoutes?: boolean;
    [key: string]: unknown;
  };
};

const { convertHeaders, convertRedirects, convertRewrites, convertTrailingSlash } = routingUtils;

type NextAdapterRoutingRoute = NextRoutingRoute & {
  source?: string;
  priority?: boolean;
};

type InternalRoute = {
  internal?: boolean;
};

// Converts discovered Next route facts and loaded next.config routes into
// `@next/routing` input data. Next owns custom-route regex/status construction
// through `generateRoutesManifest`, deployment routing conversion through
// `@vercel/routing-utils`, and dynamic app route regexes through
// `getNamedRouteRegex`.
//
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/generate-routes-manifest.ts
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/adapter/build-complete.ts
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/shared/lib/router/utils/route-regex.ts
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next-routing/src/types.ts
// Adaptation: Vitest route discovery already provides app page and route
// handler pathnames, so this adapter only translates those facts plus loaded
// next.config custom routes into the standalone `@next/routing` data model.
// The production adapter also contributes internal static-asset on-match
// headers from build outputs; Vitest's browser runtime has no emitted Next
// static build output at this boundary, so only loaded `onMatchHeaders` are
// forwarded.
export function createNextRoutingData(manifest: NextRoutingManifest): NextRoutingData {
  const discoveredPathnames = createPathnames(manifest.pages, manifest.routeHandlers);
  const pathnames = normalizePathnames(discoveredPathnames, manifest.nextConfig);
  const rewrites = normalizeRewrites(manifest.customRoutes.rewrites);
  const routesManifest = generateRoutesManifest({
    pageKeys: {
      pages: [],
      app: discoveredPathnames,
    },
    config: createRoutesManifestConfig(manifest.nextConfig),
    redirects: manifest.customRoutes.redirects,
    headers: manifest.customRoutes.headers,
    onMatchHeaders: manifest.customRoutes.onMatchHeaders,
    rewrites,
    restrictedRedirectPaths: ["/_next"],
    isAppPPREnabled: Boolean(manifest.nextConfig?.cacheComponents),
    appType: "app",
  }).routesManifest;

  return {
    buildId: nextRoutingBuildId,
    basePath: manifest.nextConfig?.basePath ?? "",
    i18n: normalizeI18n(manifest.nextConfig),
    pathnames,
    routes: {
      beforeMiddleware: [
        ...routesManifest.headers.map(buildRouteFromHeader),
        ...buildRedirectItems(routesManifest.redirects, manifest.nextConfig),
      ],
      beforeFiles: routesManifest.rewrites.beforeFiles.map(buildRewriteItem),
      afterFiles: routesManifest.rewrites.afterFiles.map(buildRewriteItem),
      dynamicRoutes: routesManifest.dynamicRoutes.map((route) =>
        buildDynamicRouteItem(route, manifest.nextConfig),
      ),
      onMatch: routesManifest.onMatchHeaders.map(buildRouteFromHeader),
      fallback: routesManifest.rewrites.fallback.map(buildRewriteItem),
    },
  };
}

export async function generateNextRouteManifestModule(
  root: string,
  entries: NextRouteManifestBuildEntry[],
  routeHandlers: NextRouteHandlerManifestBuildEntry[],
  projectConfig: NextProjectConfig,
) {
  const routing = createNextRoutingData({
    pages: entries,
    routeHandlers,
    customRoutes: projectConfig.customRoutes,
    nextConfig: projectConfig.nextConfig,
  });
  const pageEntries = await Promise.all(
    entries.map(async (entry, index) => {
      const loaderOptions = await createNextAppLoaderOptions(root, projectConfig, entry);
      return {
        entry,
        index,
        routeTreeSource: createNextRouteTreeVirtualSource(loaderOptions),
        edgeAppPageSource: createNextEdgeSsrAppVirtualSource(loaderOptions),
      };
    }),
  );
  const imports = pageEntries
    .map(({ index, routeTreeSource, edgeAppPageSource }) =>
      [
        `import { tree as tree${index} } from ${JSON.stringify(routeTreeSource)};`,
        `const edgeAppPage${index} = () => import(${JSON.stringify(edgeAppPageSource)});`,
      ].join("\n"),
    )
    .join("\n");
  const routeHandlerEntries = await Promise.all(
    routeHandlers.map(async (entry, index) => {
      const loaderOptions = await createNextAppRouteLoaderOptions(root, projectConfig, entry);
      return {
        entry,
        index,
        edgeAppRouteSource: createNextEdgeAppRouteVirtualSource(loaderOptions),
      };
    }),
  );
  const routeHandlerImports = routeHandlerEntries
    .map(
      ({ index, edgeAppRouteSource }) =>
        `const edgeAppRoute${index} = () => import(${JSON.stringify(edgeAppRouteSource)});`,
    )
    .join("\n");

  const manifest = `[${pageEntries
    .map(
      ({ entry, index, edgeAppPageSource }) => `{
        route: ${JSON.stringify(entry.route)},
        appPath: ${JSON.stringify(entry.appPath)},
        pageFile: ${JSON.stringify(entry.pageFile)},
        rootDir: ${JSON.stringify(root)},
        loaderTree: tree${index},
        edgeAppPageSource: ${JSON.stringify(edgeAppPageSource)},
        edgeAppPage: edgeAppPage${index},
      }`,
    )
    .join(",")}]`;

  const routeHandlerManifest = `[${routeHandlerEntries
    .map(
      ({ entry, index, edgeAppRouteSource }) => `{
        route: ${JSON.stringify(entry.route)},
        appPath: ${JSON.stringify(entry.appPath)},
        routeFile: ${JSON.stringify(entry.routeFile)},
        edgeAppRouteSource: ${JSON.stringify(edgeAppRouteSource)},
        edgeAppRoute: edgeAppRoute${index},
      }`,
    )
    .join(",")}]`;

  return `${imports}\n${routeHandlerImports}\nexport const nextRouteManifest = ${manifest};\nexport const nextRouteHandlerManifest = ${routeHandlerManifest};\nexport const routing = ${JSON.stringify(routing)};\nexport const nextRoutingData = routing;\n`;
}

function createPathnames(pages: NextRoutingRouteEntry[], routeHandlers: NextRoutingRouteEntry[]) {
  return Array.from(new Set([...pages, ...routeHandlers].map((entry) => entry.route)));
}

function normalizePathnames(pathnames: string[], config: NextRoutesManifestConfig | undefined) {
  return Array.from(
    new Set(pathnames.map((pathname) => normalizeAdapterPathname(pathname, config?.basePath))),
  );
}

// Mirrors Next adapter output pathname normalization.
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/adapter/build-complete.ts#L416-L434
// Adaptation: Vitest has discovered route entries instead of production
// AdapterOutput records, so only the pathname string normalization is needed.
function normalizeAdapterPathname(pathname: string, basePath: string | undefined) {
  if (!basePath) return pathname;
  return addPathPrefix(pathname, basePath).replace(/\/$/, "") || "/";
}

function normalizeI18n(config: NextRoutesManifestConfig | undefined): NextRoutingData["i18n"] {
  const i18n = config?.i18n;
  if (!i18n) return undefined;

  return {
    defaultLocale: i18n.defaultLocale,
    domains: i18n.domains?.map((domain) => ({
      defaultLocale: domain.defaultLocale,
      domain: domain.domain,
      http: domain.http,
      locales: domain.locales ? [...domain.locales] : undefined,
    })),
    localeDetection: i18n.localeDetection,
    locales: [...i18n.locales],
  };
}

function normalizeRewrites(rewrites: NextRoutingCustomRoutes["rewrites"]) {
  if (Array.isArray(rewrites)) {
    return {
      beforeFiles: [],
      afterFiles: rewrites,
      fallback: [],
    };
  }

  return rewrites;
}

function createRoutesManifestConfig(
  config: NextRoutesManifestConfig | undefined,
): NextConfigComplete {
  return {
    basePath: config?.basePath ?? "",
    cacheComponents: config?.cacheComponents,
    i18n: config?.i18n,
    skipTrailingSlashRedirect: config?.skipTrailingSlashRedirect,
    trailingSlash: config?.trailingSlash,
    experimental: {
      caseSensitiveRoutes: config?.experimental?.caseSensitiveRoutes,
    },
  } as NextConfigComplete;
}
// End adapted

// Begin adapted: Next.js adapter custom-route mapping
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/adapter/build-complete.ts
// Adaptation: input routes come from Next's `generateRoutesManifest()` instead
// of a production build's route manifest. This keeps the same
// `@vercel/routing-utils` conversion shape and omits only the production
// static-asset on-match header route, which depends on build outputs Vitest
// does not create.
function buildRewriteItem(route: ManifestRewriteRoute & InternalRoute): NextAdapterRoutingRoute {
  const converted = firstConverted(convertRewrites([route], ["nextInternalLocale"]), "rewrite");
  const regex = converted.src || route.regex;
  return {
    source: route.source,
    sourceRegex: route.internal ? regex : modifyRouteRegex(regex),
    destination: converted.dest || route.destination,
    has: route.has,
    missing: route.missing,
  };
}

function buildRouteFromHeader(route: ManifestHeaderRoute & InternalRoute): NextAdapterRoutingRoute {
  const converted = firstConverted(convertHeaders([route]), "header");
  const regex = converted.src || route.regex;
  return {
    source: route.source,
    sourceRegex: route.internal ? regex : modifyRouteRegex(regex),
    headers: converted.headers || {},
    has: route.has,
    missing: route.missing,
    priority: route.internal || undefined,
  };
}

function buildRedirectItems(
  routes: (ManifestRedirectRoute & InternalRoute)[],
  config: NextRoutesManifestConfig | undefined,
): NextAdapterRoutingRoute[] {
  const items: NextAdapterRoutingRoute[] = [];
  let trailingSlashRedirectConverted = false;

  for (const route of routes) {
    if (isNextInternalTrailingSlashRedirect(route)) {
      if (!trailingSlashRedirectConverted) {
        items.push(...buildTrailingSlashRedirectItems(config));
        trailingSlashRedirectConverted = true;
      }
      continue;
    }

    items.push(buildRedirectItem(route));
  }

  return items;
}

function buildRedirectItem(route: ManifestRedirectRoute & InternalRoute): NextAdapterRoutingRoute {
  const converted = firstConverted(convertRedirects([route], 307), "redirect");
  const regex = converted.src || route.regex;
  return {
    source: route.source,
    sourceRegex: route.internal ? regex : modifyRouteRegex(regex),
    headers: converted.headers || {},
    status: converted.status || getRedirectStatus(route),
    has: route.has,
    missing: route.missing,
    priority: route.internal || undefined,
  };
}

// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/lib/load-custom-routes.ts#L795-L841
// Source: next/dist/compiled/@vercel/routing-utils/superstatic.js `convertTrailingSlash`
// Adaptation: `loadCustomRoutes()` injects these internal redirect shapes before
// `generateRoutesManifest()`. The production adapter converts that behavior via
// `convertTrailingSlash()` rather than by parsing the internal `/:path+/`
// route as a user redirect.
function isNextInternalTrailingSlashRedirect(route: ManifestRedirectRoute & InternalRoute) {
  if (!route.internal || !route.priority) return false;

  return (
    (route.source === "/:path+/" && route.destination === "/:path+") ||
    (route.source === "/:file((?!\\.well-known(?:/.*)?)(?:[^/]+/)*[^/]+\\.\\w+)/" &&
      route.destination === "/:file") ||
    (route.source === "/:notfile((?!\\.well-known(?:/.*)?)(?:[^/]+/)*[^/\\.]+)" &&
      route.destination === "/:notfile/")
  );
}

function buildTrailingSlashRedirectItems(
  config: NextRoutesManifestConfig | undefined,
): NextAdapterRoutingRoute[] {
  return convertTrailingSlash(Boolean(config?.trailingSlash), 308).map((route) => ({
    sourceRegex: route.src ?? "",
    headers: route.headers ?? {},
    status: route.status,
    priority: true,
  }));
}

function firstConverted<T>(items: T[], kind: string): T {
  const item = items[0];
  if (!item) throw new Error(`Failed to convert Next ${kind} route for @next/routing.`);
  return item;
}
// End adapted

// Begin adapted: Next.js adapter dynamic route mapping
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/adapter/build-complete.ts
// Adaptation: Vitest has no prerender manifest at this boundary, so fallback
// false conditions and app `.rsc`/segment data routes are omitted. The app
// page/route-handler dynamic route shape, regex, and route-key destination
// query match Next's adapter mapping.
function buildDynamicRouteItem(
  route: DynamicManifestRoute,
  config: NextRoutesManifestConfig | undefined,
): NextRoutingRoute {
  const shouldLocalize = config?.i18n;
  const routeRegex = getNamedRouteRegex(route.page, {
    prefixRouteKeys: true,
  });
  const sourceRegex = routeRegex.namedRegex.replace(
    "^",
    `^${config?.basePath && config.basePath !== "/" ? path.posix.join("/", config.basePath) : ""}[/]?${
      shouldLocalize ? "(?<nextLocale>[^/]{1,})" : ""
    }`,
  );
  const destination =
    path.posix.join("/", config?.basePath ?? "", shouldLocalize ? "/$nextLocale" : "", route.page) +
    getDestinationQuery(route.routeKeys);

  return {
    sourceRegex,
    destination,
  };
}

function getDestinationQuery(routeKeys: Record<string, string> | undefined) {
  const items = Object.entries(routeKeys ?? {});
  if (items.length === 0) return "";
  return `?${items.map(([key, value]) => `${value}=$${key}`).join("&")}`;
}
// End adapted
