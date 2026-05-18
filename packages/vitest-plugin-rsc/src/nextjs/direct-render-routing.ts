import type { Route as NextRoutingRoute } from "@next/routing";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths.js";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher.js";
import {
  getNamedRouteRegex,
  getRouteRegex,
} from "next/dist/shared/lib/router/utils/route-regex.js";
import { nextRoutingBuildId, type NextRoutingData } from "./routing-types.ts";

type PageOnlyRouteEntry = {
  route: string;
};

export function assertRoutePatternMatchesPath(routePattern: string, pathname: string) {
  if (matchDirectRenderRoutePatternParams(routePattern, pathname)) return;

  throw new Error(`Pattern "${routePattern}" does not match pathname "${pathname}".`);
}

export function createPageOnlyRoutingData(pages: PageOnlyRouteEntry[]): NextRoutingData {
  return {
    buildId: nextRoutingBuildId,
    basePath: "",
    i18n: undefined,
    pathnames: Array.from(new Set(pages.map((entry) => entry.route))),
    routes: {
      beforeMiddleware: [],
      beforeFiles: [],
      afterFiles: [],
      dynamicRoutes: createDynamicRoutes(pages),
      onMatch: [],
      fallback: [],
    },
  };
}

function matchDirectRenderRoutePatternParams(routePattern: string, pathname: string) {
  try {
    return getRouteMatcher(getRouteRegex(normalizeRoutePatternAsAppPath(routePattern)))(pathname);
  } catch {
    return;
  }
}

function createDynamicRoutes(pages: PageOnlyRouteEntry[]) {
  const routes = new Map<string, NextRoutingRoute>();
  for (const entry of pages) {
    if (!entry.route.includes("[")) continue;
    routes.set(entry.route, createDynamicRoute(entry.route));
  }
  return Array.from(routes.values());
}

// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/adapter/build-complete.ts
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/route-matchers/route-matcher.ts
// Adaptation: direct ReactNode/page-only renders do not go through the Vite
// route-manifest virtual module, so they synthesize only the dynamic route data
// needed by `@next/routing` without custom-route conversion.
function createDynamicRoute(route: string): NextRoutingRoute {
  const routeRegex = getNamedRouteRegex(route, {
    prefixRouteKeys: true,
  });
  return {
    sourceRegex: routeRegex.namedRegex,
    destination: `${route}${getDestinationQuery(routeRegex.routeKeys)}`,
  };
}

function getDestinationQuery(routeKeys: Record<string, string> | undefined) {
  const items = Object.entries(routeKeys ?? {});
  if (items.length === 0) return "";
  return `?${items.map(([key, value]) => `${value}=$${key}`).join("&")}`;
}

function ensureLeadingSlash(routePattern: string) {
  return routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
}

function normalizeRoutePatternAsAppPath(routePattern: string) {
  const withLeadingSlash = ensureLeadingSlash(routePattern);
  const withoutTrailingSlash = withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/$/, "");
  return normalizeAppPath(`${withoutTrailingSlash}/page`);
}
