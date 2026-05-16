import type { ResolveRoutesParams, Route as NextRoutingRoute } from "@next/routing";
import type {
  ManifestHeaderRoute,
  ManifestRedirectRoute,
  ManifestRewriteRoute,
} from "next/dist/build/index.js";
import { buildCustomRoute } from "next/dist/lib/build-custom-route.js";
import routingUtils from "next/dist/compiled/@vercel/routing-utils/superstatic.js";
import { getRedirectStatus, modifyRouteRegex } from "next/dist/lib/redirect-status.js";
import type { CustomRoutes, Header, Redirect, Rewrite } from "next/dist/lib/load-custom-routes.js";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths.js";
import { getNamedRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";
import type {
  NextRouteHandlerManifestEntry,
  NextRouteManifest,
  NextRouteManifestEntry,
} from "./request-router";

export type NextRoutingData = Pick<ResolveRoutesParams, "pathnames" | "routes">;

type NextRoutingCustomRoutes = Omit<CustomRoutes, "rewrites"> & {
  rewrites: CustomRoutes["rewrites"] | Rewrite[];
};

export type NextRoutingManifest = Omit<NextRouteManifest, "customRoutes"> & {
  customRoutes: NextRoutingCustomRoutes;
};

const { convertHeaders, convertRedirects, convertRewrites } = routingUtils;

type NextAdapterRoutingRoute = NextRoutingRoute & {
  source?: string;
  priority?: boolean;
};

type InternalRoute = {
  internal?: boolean;
};

// Converts discovered Next route facts and loaded next.config routes into
// `@next/routing` input data. Next owns custom-route regex/status construction
// through `buildCustomRoute`, deployment routing conversion through
// `@vercel/routing-utils`, and dynamic app route regexes through
// `getNamedRouteRegex`.
//
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/lib/build-custom-route.ts
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
  const pathnames = createPathnames(manifest.pages, manifest.routeHandlers);
  const rewrites = normalizeRewrites(manifest.customRoutes.rewrites);

  return {
    pathnames,
    routes: {
      beforeMiddleware: [
        ...manifest.customRoutes.headers.map(convertHeaderRoute),
        ...manifest.customRoutes.redirects.map(convertRedirectRoute),
      ],
      beforeFiles: rewrites.beforeFiles.map(convertRewriteRoute),
      afterFiles: rewrites.afterFiles.map(convertRewriteRoute),
      dynamicRoutes: createDynamicRoutes(manifest.pages, manifest.routeHandlers),
      onMatch: manifest.customRoutes.onMatchHeaders.map(convertHeaderRoute),
      fallback: rewrites.fallback.map(convertRewriteRoute),
    },
  };
}

function createPathnames(
  pages: NextRouteManifestEntry[],
  routeHandlers: NextRouteHandlerManifestEntry[],
) {
  return Array.from(new Set([...pages, ...routeHandlers].map((entry) => entry.route)));
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

function convertRedirectRoute(route: Redirect): NextAdapterRoutingRoute {
  const built: ManifestRedirectRoute = buildCustomRoute("redirect", route, ["/_next"]);
  return buildRedirectItem(built);
}

function convertRewriteRoute(route: Rewrite): NextAdapterRoutingRoute {
  const built: ManifestRewriteRoute = buildCustomRoute("rewrite", route);
  return buildRewriteItem(built);
}

function convertHeaderRoute(route: Header): NextAdapterRoutingRoute {
  const built: ManifestHeaderRoute = buildCustomRoute("header", route);
  return buildRouteFromHeader(built);
}

// Begin copy: Next.js adapter custom-route mapping
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/adapter/build-complete.ts
// Adaptation: input routes come from loaded `next.config` custom routes, so this
// adapter first builds `Manifest*Route` values with Next's `buildCustomRoute`.
// It keeps the same `@vercel/routing-utils` conversion shape and omits only the
// production static-asset on-match header route, which depends on build outputs
// Vitest does not create.
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
// End copy

function firstConverted<T>(items: T[], kind: string): T {
  const item = items[0];
  if (!item) throw new Error(`Failed to convert Next ${kind} route for @next/routing.`);
  return item;
}

function createDynamicRoutes(
  pages: NextRouteManifestEntry[],
  routeHandlers: NextRouteHandlerManifestEntry[],
) {
  const routes = new Map<string, NextRoutingRoute>();
  for (const entry of [...pages, ...routeHandlers]) {
    if (!entry.route.includes("[")) continue;
    routes.set(entry.route, createDynamicRoute(entry.route));
  }
  return Array.from(routes.values());
}

function createDynamicRoute(route: string): NextRoutingRoute {
  const normalizedRoute = normalizeRoutePattern(route);
  const routeRegex = getNamedRouteRegex(normalizedRoute, {
    prefixRouteKeys: false,
  });
  return {
    sourceRegex: routeRegex.namedRegex,
    destination: route,
  };
}

function normalizeRoutePattern(routePattern: string) {
  const withLeadingSlash = routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
  const withoutTrailingSlash = withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/$/, "");
  return normalizeAppPath(`${withoutTrailingSlash}/page`);
}
