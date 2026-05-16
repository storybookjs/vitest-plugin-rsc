import type { Route as NextRoutingRoute, RouteHas } from "@next/routing";
import { buildCustomRoute } from "next/dist/lib/build-custom-route.js";
import { parse } from "next/dist/compiled/path-to-regexp";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths.js";
import { getNamedRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";
import type {
  NextCustomRoute,
  NextCustomRoutes,
  NextRouteHandlerManifestEntry,
  NextRouteManifest,
  NextRouteManifestEntry,
} from "./request-router";

export type NextRoutingData = {
  pathnames: string[];
  routes: {
    beforeMiddleware: NextRoutingRoute[];
    beforeFiles: NextRoutingRoute[];
    afterFiles: NextRoutingRoute[];
    dynamicRoutes: NextRoutingRoute[];
    onMatch: NextRoutingRoute[];
    fallback: NextRoutingRoute[];
    shouldNormalizeNextData?: boolean;
  };
};

type NextRoutingCustomRoutes = Omit<NextCustomRoutes, "rewrites"> & {
  rewrites: NextCustomRoutes["rewrites"] | NextCustomRoute[];
};

export type NextRoutingManifest = Omit<NextRouteManifest, "customRoutes"> & {
  customRoutes: NextRoutingCustomRoutes;
};

type BuiltCustomRoute = NextCustomRoute & {
  regex: string;
  statusCode?: number;
};

type CustomRouteKind = "header" | "redirect" | "rewrite";

// Converts discovered Next route facts and loaded next.config routes into
// `@next/routing` input data. Next still owns custom-route regex/status
// construction via `buildCustomRoute`, and dynamic app routes come from
// `getNamedRouteRegex`.
//
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/lib/build-custom-route.ts
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/shared/lib/router/utils/route-regex.ts
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next-routing/src/types.ts
// Adaptation: Vitest route discovery already provides app page and route
// handler pathnames, so this adapter only translates those facts plus loaded
// next.config custom routes into the standalone `@next/routing` data model.
export function createNextRoutingData(manifest: NextRoutingManifest): NextRoutingData {
  const pathnames = createPathnames(manifest.pages, manifest.routeHandlers);
  const rewrites = normalizeRewrites(manifest.customRoutes.rewrites);

  return {
    pathnames,
    routes: {
      beforeMiddleware: manifest.customRoutes.redirects.map(convertRedirectRoute),
      beforeFiles: rewrites.beforeFiles.map(convertRewriteRoute),
      afterFiles: rewrites.afterFiles.map(convertRewriteRoute),
      dynamicRoutes: createDynamicRoutes(manifest.pages, manifest.routeHandlers),
      onMatch: manifest.customRoutes.headers.map(convertHeaderRoute),
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

function convertRedirectRoute(route: NextCustomRoute): NextRoutingRoute {
  const built = buildNextCustomRoute("redirect", route);
  const destination = route.destination
    ? convertNextRouteTemplate(route.destination, route.source)
    : undefined;
  return {
    sourceRegex: built.regex,
    destination,
    headers: destination ? { Location: destination } : undefined,
    has: toRoutingConditions(route.has),
    missing: toRoutingConditions(route.missing),
    status: built.statusCode,
  };
}

function convertRewriteRoute(route: NextCustomRoute): NextRoutingRoute {
  const built = buildNextCustomRoute("rewrite", route);
  return {
    sourceRegex: built.regex,
    destination: route.destination
      ? convertNextRouteTemplate(route.destination, route.source)
      : undefined,
    has: toRoutingConditions(route.has),
    missing: toRoutingConditions(route.missing),
  };
}

function convertHeaderRoute(route: NextCustomRoute): NextRoutingRoute {
  const built = buildNextCustomRoute("header", route);
  return {
    sourceRegex: built.regex,
    headers: Object.fromEntries(
      (route.headers ?? []).map((header) => [
        convertNextRouteTemplate(header.key, route.source),
        convertNextRouteTemplate(header.value, route.source),
      ]),
    ),
    has: toRoutingConditions(route.has),
    missing: toRoutingConditions(route.missing),
  };
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
    destination: createDynamicRouteDestination(route, routeRegex.reference.names),
  };
}

function createDynamicRouteDestination(route: string, routeKeys: Record<string, string>) {
  const query = Object.entries(routeKeys).map(
    ([paramName, routeKey]) => `${encodeURIComponent(paramName)}=$${routeKey}`,
  );

  return query.length > 0 ? `${route}?${query.join("&")}` : route;
}

function buildNextCustomRoute(kind: "header", route: NextCustomRoute): BuiltCustomRoute;
function buildNextCustomRoute(kind: "rewrite", route: NextCustomRoute): BuiltCustomRoute;
function buildNextCustomRoute(kind: "redirect", route: NextCustomRoute): BuiltCustomRoute;
function buildNextCustomRoute(kind: CustomRouteKind, route: NextCustomRoute): BuiltCustomRoute {
  if (kind === "redirect") {
    return buildCustomRoute("redirect", route as never, ["/_next"]) as BuiltCustomRoute;
  }

  if (kind === "header") {
    return buildCustomRoute("header", route as never) as BuiltCustomRoute;
  }

  return buildCustomRoute("rewrite", route as never) as BuiltCustomRoute;
}

function convertNextRouteTemplate(value: string, source: string) {
  const placeholders = createSourceParamPlaceholders(source);
  return value.replace(
    /:([A-Za-z_][A-Za-z0-9_]*)([?*+])?/g,
    (token, key: string, destinationModifier: string | undefined, offset: number) => {
      const placeholder = placeholders.get(key);
      const replacement = placeholder?.value ?? `$${key}`;
      if (!destinationModifier) return replacement;

      const modifierOffset = offset + token.length - destinationModifier.length;
      if (
        placeholder?.modifier === destinationModifier &&
        !isUrlQueryDelimiter(value, modifierOffset)
      ) {
        return replacement;
      }

      return `${replacement}${destinationModifier}`;
    },
  );
}

function createSourceParamPlaceholders(source: string) {
  const placeholders = new Map<string, { value: string; modifier: string }>();
  for (const token of parse(source)) {
    if (typeof token === "string") continue;
    if (typeof token.name !== "string") continue;
    placeholders.set(token.name, {
      value: `$${placeholders.size + 1}`,
      modifier: token.modifier,
    });
  }
  return placeholders;
}

function isUrlQueryDelimiter(value: string, offset: number) {
  if (value[offset] !== "?") return false;
  if (value.lastIndexOf("?", offset - 1) !== -1) return false;
  const next = value[offset + 1];
  return Boolean(next && next !== "/" && next !== "#" && next !== "&");
}

function toRoutingConditions(conditions: unknown[] | undefined) {
  return conditions?.length ? (conditions as RouteHas[]) : undefined;
}

function normalizeRoutePattern(routePattern: string) {
  const withLeadingSlash = routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
  const withoutTrailingSlash = withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/$/, "");
  return normalizeAppPath(`${withoutTrailingSlash}/page`);
}
